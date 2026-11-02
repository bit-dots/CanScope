use std::collections::hash_map::DefaultHasher;
use std::collections::VecDeque;
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use canscope_core::{
    BusType, CanFrame, CanFrameStream, FileFormat, SeekError, SourceType, StreamMetadata,
};
use rusqlite::{params, Connection, OptionalExtension};

use crate::error::ParseError;

const MONTH_NAMES: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const READ_PAGE_SIZE: usize = 512;
const MAX_PAGE_SIZE: usize = 4096;
const INDEX_SCHEMA_VERSION: i64 = 1;

/// 将 ASC 文件头部的 date 字符串（如 `Sun Oct 17 14:30:00.000 2026`）
/// 转换为 ISO 8601 格式（`2026-10-17T14:30:00.000`）。
/// Tauri WebView 的 JS 引擎无法可靠解析 ASC 原始格式，必须标准化。
fn parse_asc_date(raw: &str) -> Option<String> {
    let parts: Vec<&str> = raw.split_whitespace().collect();
    // 支持两种格式:
    // 5 部分: "Fri Oct 23 09:41:04.039 2026"
    // 6 部分: "Fri Oct 23 09:41:04.039 AM 2026"
    if parts.len() < 5 {
        return None;
    }
    let month_idx = MONTH_NAMES
        .iter()
        .position(|&m| m.eq_ignore_ascii_case(parts[1]))?;
    let month = month_idx + 1;
    let day: u32 = parts[2].parse().ok()?;
    let time = parts[3];
    let year: u32 = if parts.len() >= 6 {
        parts[5].parse().ok()?
    } else {
        parts[4].parse().ok()?
    };
    Some(format!("{:04}-{:02}-{:02}T{}", year, month, day, time))
}

/// ASC 格式读取器。源帧存储于可复用的 SQLite 索引中，读取时按页进入内存。
pub struct AscReader {
    metadata: StreamMetadata,
    timestamp_origin: f64,
    connection: Mutex<Connection>,
    cursor: u64,
    page: VecDeque<CanFrame>,
}

impl AscReader {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, ParseError> {
        let cache_dir = std::env::temp_dir().join("canscope-frame-index");
        Self::open_with_cache(path, cache_dir)
    }

    pub fn open_with_cache(
        path: impl AsRef<Path>,
        cache_dir: impl AsRef<Path>,
    ) -> Result<Self, ParseError> {
        Self::open_with_cache_and_progress(path, cache_dir, |_| Ok(()))
    }

    pub fn open_with_cache_and_progress(
        path: impl AsRef<Path>,
        cache_dir: impl AsRef<Path>,
        mut progress: impl FnMut(u64) -> Result<(), String>,
    ) -> Result<Self, ParseError> {
        let path = path.as_ref();
        let canonical_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let file_metadata = fs::metadata(path).map_err(|e| ParseError::FileRead {
            path: path.to_path_buf(),
            source: e,
        })?;
        let modified_ns = file_metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos().min(i64::MAX as u128) as i64)
            .unwrap_or(0);
        let source_size = file_metadata.len().min(i64::MAX as u64) as i64;

        fs::create_dir_all(cache_dir.as_ref()).map_err(|e| ParseError::FileRead {
            path: cache_dir.as_ref().to_path_buf(),
            source: e,
        })?;
        let mut hasher = DefaultHasher::new();
        canonical_path.hash(&mut hasher);
        let cache_path = cache_dir
            .as_ref()
            .join(format!("{:016x}.sqlite3", hasher.finish()));
        let mut connection =
            Connection::open(&cache_path).map_err(|e| ParseError::IndexError(e.to_string()))?;
        connection
            .busy_timeout(std::time::Duration::from_secs(30))
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS source_metadata (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    schema_version INTEGER NOT NULL,
                    source_size INTEGER NOT NULL,
                    modified_ns INTEGER NOT NULL,
                    total_frames INTEGER NOT NULL,
                    duration REAL,
                    bus_count INTEGER NOT NULL,
                    start_time TEXT
                );
                CREATE TABLE IF NOT EXISTS frames (
                    seq INTEGER PRIMARY KEY,
                    timestamp REAL NOT NULL,
                    bus_id INTEGER NOT NULL,
                    can_id INTEGER NOT NULL,
                    flags INTEGER NOT NULL,
                    dlc INTEGER NOT NULL,
                    data BLOB NOT NULL
                );
                CREATE INDEX IF NOT EXISTS frames_timestamp_idx ON frames(timestamp, seq);
                CREATE INDEX IF NOT EXISTS frames_can_time_idx ON frames(can_id, timestamp, seq);",
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;

        let cached_metadata = connection
            .query_row(
                "SELECT schema_version, source_size, modified_ns, total_frames,
                        duration, bus_count, start_time
                 FROM source_metadata WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, Option<f64>>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, Option<String>>(6)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| ParseError::IndexError(e.to_string()))?;

        let valid_cache = cached_metadata.as_ref().map_or(false, |cached| {
            cached.0 == INDEX_SCHEMA_VERSION && cached.1 == source_size && cached.2 == modified_ns
        });

        if !valid_cache {
            Self::build_index(
                path,
                &mut connection,
                source_size,
                modified_ns,
                &mut progress,
            )?;
        }

        let cached = connection
            .query_row(
                "SELECT total_frames, duration, bus_count, start_time
                 FROM source_metadata WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? as u64,
                        row.get::<_, Option<f64>>(1)?,
                        row.get::<_, i64>(2)? as u8,
                        row.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let timestamp_origin = connection
            .query_row("SELECT MIN(timestamp) FROM frames", [], |row| {
                row.get::<_, Option<f64>>(0)
            })
            .map_err(|e| ParseError::IndexError(e.to_string()))?
            .unwrap_or(0.0);

        let metadata = StreamMetadata {
            source_type: SourceType::File {
                path: canonical_path,
                format: FileFormat::Asc,
            },
            bus_type: BusType::Can,
            bus_count: cached.2,
            start_time: cached.3,
            total_frames: Some(cached.0),
            duration: cached
                .1
                .map(|last_timestamp| (last_timestamp - timestamp_origin).max(0.0)),
        };

        Ok(Self {
            metadata,
            timestamp_origin,
            connection: Mutex::new(connection),
            cursor: 0,
            page: VecDeque::new(),
        })
    }

    fn build_index(
        path: &Path,
        connection: &mut Connection,
        source_size: i64,
        modified_ns: i64,
        progress: &mut impl FnMut(u64) -> Result<(), String>,
    ) -> Result<(), ParseError> {
        let file = File::open(path).map_err(|e| ParseError::FileRead {
            path: path.to_path_buf(),
            source: e,
        })?;
        let reader = BufReader::new(file);

        let mut metadata = StreamMetadata {
            source_type: SourceType::File {
                path: path.to_path_buf(),
                format: FileFormat::Asc,
            },
            bus_type: BusType::Can,
            bus_count: 0,
            start_time: None,
            total_frames: None,
            duration: None,
        };

        let transaction = connection
            .transaction()
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        transaction
            .execute("DELETE FROM frames", [])
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        transaction
            .execute("DELETE FROM source_metadata", [])
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let mut insert_frame = transaction
            .prepare_cached(
                "INSERT INTO frames (seq, timestamp, bus_id, can_id, flags, dlc, data)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let mut frame_count: u64 = 0;
        let mut last_timestamp = None;
        let mut in_data = false;
        let mut max_bus: u8 = 0;

        for (line_num, line_result) in reader.lines().enumerate() {
            let line = line_result.map_err(|e| ParseError::FileRead {
                path: path.to_path_buf(),
                source: e,
            })?;
            let line_num = line_num + 1;

            let trimmed = line.trim();

            if trimmed.is_empty() || trimmed.starts_with("//") {
                continue;
            }

            if !in_data {
                // Header 阶段：跳过已知的 header 行
                if let Some(date_str) = trimmed.strip_prefix("date ") {
                    metadata.start_time = parse_asc_date(date_str);
                    continue;
                }
                if trimmed.starts_with("base ") || trimmed.starts_with("no ") {
                    continue;
                }
                if trimmed.starts_with("Begin Triggerblock") {
                    in_data = true;
                    continue;
                }
                // 不以关键字开头且首字符为数字 → 无 trigger block 的 ASC，直接进入数据模式
                if trimmed.chars().next().map_or(false, |c| c.is_ascii_digit()) {
                    in_data = true;
                    // 不回 continue，让下面代码解析本行
                } else {
                    continue;
                }
            }

            if trimmed.starts_with("End Triggerblock") {
                break;
            }

            let frame = Self::parse_frame_line(trimmed).map_err(|()| ParseError::InvalidFrame {
                line: line_num,
                text: trimmed.to_string(),
            })?;

            max_bus = max_bus.max(frame.bus_id.saturating_add(1));
            let flags = i64::from(frame.is_extended)
                | (i64::from(frame.is_remote) << 1)
                | (i64::from(frame.is_fd) << 2)
                | (i64::from(frame.is_tx) << 3);
            insert_frame
                .execute(params![
                    frame_count as i64,
                    frame.timestamp,
                    frame.bus_id,
                    frame.can_id,
                    flags,
                    frame.dlc,
                    &frame.data[..],
                ])
                .map_err(|e| ParseError::IndexError(e.to_string()))?;
            frame_count += 1;
            last_timestamp = Some(frame.timestamp);
            if frame_count % 10_000 == 0 {
                progress(frame_count).map_err(ParseError::IndexError)?;
            }
        }

        progress(frame_count).map_err(ParseError::IndexError)?;
        drop(insert_frame);
        transaction
            .execute(
                "INSERT INTO source_metadata
                 (id, schema_version, source_size, modified_ns, total_frames, duration, bus_count, start_time)
                 VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    INDEX_SCHEMA_VERSION,
                    source_size,
                    modified_ns,
                    frame_count as i64,
                    last_timestamp,
                    max_bus,
                    metadata.start_time,
                ],
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        transaction
            .commit()
            .map_err(|e| ParseError::IndexError(e.to_string()))
    }

    pub fn frame_count(&self) -> u64 {
        self.metadata.total_frames.unwrap_or(0)
    }

    pub fn read_page(&self, start: u64, limit: usize) -> Result<Vec<CanFrame>, ParseError> {
        let limit = limit.min(MAX_PAGE_SIZE);
        let connection = self
            .connection
            .lock()
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let mut statement = connection
            .prepare(
                "SELECT timestamp, bus_id, can_id, flags, dlc, data
                 FROM frames WHERE seq >= ?1 ORDER BY seq LIMIT ?2",
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let rows = statement
            .query_map(
                params![start.min(i64::MAX as u64) as i64, limit as i64],
                Self::frame_from_row,
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        rows.map(|row| row.map_err(|e| ParseError::IndexError(e.to_string())))
            .collect()
    }

    pub fn query_page(
        &self,
        offset: u64,
        limit: usize,
        can_id: Option<u32>,
        time_start: Option<f64>,
        time_end: Option<f64>,
    ) -> Result<(u64, Vec<CanFrame>), ParseError> {
        let connection = self
            .connection
            .lock()
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let mut predicates = Vec::new();
        let mut values = Vec::new();
        if let Some(can_id) = can_id {
            predicates.push("can_id = ?");
            values.push(rusqlite::types::Value::Integer(i64::from(can_id)));
        }
        if let Some(time_start) = time_start {
            predicates.push("timestamp >= ?");
            values.push(rusqlite::types::Value::Real(time_start));
        }
        if let Some(time_end) = time_end {
            predicates.push("timestamp <= ?");
            values.push(rusqlite::types::Value::Real(time_end));
        }
        let where_clause = if predicates.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", predicates.join(" AND "))
        };
        let total: i64 = connection
            .query_row(
                &format!("SELECT COUNT(*) FROM frames{where_clause}"),
                rusqlite::params_from_iter(values.iter()),
                |row| row.get(0),
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let mut statement = connection
            .prepare(&format!(
                "SELECT timestamp, bus_id, can_id, flags, dlc, data
                 FROM frames{where_clause}
                 ORDER BY timestamp, seq LIMIT ? OFFSET ?"
            ))
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        values.push(rusqlite::types::Value::Integer(
            limit.min(MAX_PAGE_SIZE) as i64
        ));
        values.push(rusqlite::types::Value::Integer(
            offset.min(i64::MAX as u64) as i64
        ));
        let rows = statement
            .query_map(
                rusqlite::params_from_iter(values.iter()),
                Self::frame_from_row,
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let frames = rows
            .map(|row| row.map_err(|e| ParseError::IndexError(e.to_string())))
            .collect::<Result<Vec<_>, _>>()?;
        Ok((total as u64, frames))
    }

    pub fn for_each_frame(
        &self,
        time_start: f64,
        time_end: f64,
        mut visit: impl FnMut(CanFrame) -> Result<(), String>,
    ) -> Result<(), ParseError> {
        let connection = self
            .connection
            .lock()
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let mut statement = connection
            .prepare(
                "SELECT timestamp, bus_id, can_id, flags, dlc, data
                 FROM frames WHERE timestamp >= ?1 AND timestamp <= ?2
                 ORDER BY timestamp, seq",
            )
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        let rows = statement
            .query_map(params![time_start, time_end], Self::frame_from_row)
            .map_err(|e| ParseError::IndexError(e.to_string()))?;
        for row in rows {
            let frame = row.map_err(|e| ParseError::IndexError(e.to_string()))?;
            visit(frame).map_err(ParseError::IndexError)?;
        }
        Ok(())
    }

    fn frame_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CanFrame> {
        let flags: i64 = row.get(3)?;
        let bytes: Vec<u8> = row.get(5)?;
        let data: [u8; 64] = bytes.try_into().map_err(|bytes: Vec<u8>| {
            rusqlite::Error::FromSqlConversionFailure(
                5,
                rusqlite::types::Type::Blob,
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Expected 64 data bytes, got {}", bytes.len()),
                )),
            )
        })?;
        Ok(CanFrame {
            timestamp: row.get(0)?,
            bus_id: row.get(1)?,
            can_id: row.get(2)?,
            is_extended: flags & 1 != 0,
            is_remote: flags & 2 != 0,
            is_fd: flags & 4 != 0,
            is_tx: flags & 8 != 0,
            dlc: row.get(4)?,
            data,
        })
    }

    /// 解析一行 ASC CAN 帧（支持标准 CAN 和 CAN FD）。
    ///
    /// 标准 CAN 格式：`<timestamp> <channel> <can_id>[x] Rx|Tx d|r <dlc> [<hex_byte>...]`
    /// CAN FD 格式：  `<timestamp> CANFD <channel> <can_id>[x] Rx|Tx <BRS> <ESI> d|r <dlc> <byte_count> [<hex_byte>...]`
    ///
    /// - `can_id` 后缀 `x` 表示扩展帧；标准帧无后缀
    /// - `d` = data frame, `r` = remote frame
    fn parse_frame_line(line: &str) -> Result<CanFrame, ()> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            return Err(());
        }

        let timestamp: f64 = parts[0].parse().map_err(|_| ())?;

        // parts[1] 可能是 channel 号，也可能是 "CANFD" 标记
        let is_fd = parts[1].eq_ignore_ascii_case("CANFD");

        if is_fd {
            // CAN FD 格式 (parts 索引加 1)
            Self::parse_canfd_line(timestamp, &parts)
        } else {
            // 标准 CAN 格式
            Self::parse_standard_can_line(timestamp, &parts)
        }
    }

    fn parse_standard_can_line(timestamp: f64, parts: &[&str]) -> Result<CanFrame, ()> {
        let bus_id: u8 = parts[1].parse::<u8>().map_err(|_| ())?.saturating_sub(1);

        let can_id_str = parts[2];
        let (can_id, is_extended) = if let Some(ext_id) = can_id_str.strip_suffix('x') {
            (u32::from_str_radix(ext_id, 16).map_err(|_| ())?, true)
        } else {
            let id = u32::from_str_radix(can_id_str, 16).map_err(|_| ())?;
            let is_ext = id > 0x7FF;
            (id, is_ext)
        };

        let direction = parts[3];
        let is_tx = direction.eq_ignore_ascii_case("Tx");

        let (is_remote, _is_fd) = match parts[4] {
            "d" => (false, false),
            "r" => (true, false),
            _ => return Err(()),
        };

        let dlc: u8 = parts[5].parse().map_err(|_| ())?;
        let dlc_usize = dlc as usize;

        let expected_data_parts = if is_remote { 0 } else { dlc_usize };
        let data_start = 6;

        if parts.len() < data_start + expected_data_parts {
            return Err(());
        }

        let mut data = [0u8; 64];
        for (i, hex_str) in parts[data_start..data_start + expected_data_parts]
            .iter()
            .enumerate()
        {
            data[i] = u8::from_str_radix(hex_str, 16).map_err(|_| ())?;
        }

        Ok(CanFrame {
            timestamp,
            bus_id,
            can_id,
            is_extended,
            is_remote,
            is_fd: false,
            is_tx,
            dlc,
            data,
        })
    }

    fn parse_canfd_line(timestamp: f64, parts: &[&str]) -> Result<CanFrame, ()> {
        // 格式: <ts> CANFD <channel> <can_id> <Rx|Tx> <BRS> <ESI> d|r <dlc> <byte_count> <data...>
        // parts: [0]=ts [1]=CANFD [2]=ch [3]=id [4]=dir [5]=BRS [6]=ESI [7]=d/r [8]=dlc [9]=byte_cnt
        if parts.len() < 10 {
            return Err(());
        }

        let bus_id: u8 = parts[2].parse::<u8>().map_err(|_| ())?.saturating_sub(1);

        let can_id_str = parts[3];
        let (can_id, is_extended) = if let Some(ext_id) = can_id_str.strip_suffix('x') {
            (u32::from_str_radix(ext_id, 16).map_err(|_| ())?, true)
        } else {
            let id = u32::from_str_radix(can_id_str, 16).map_err(|_| ())?;
            let is_ext = id > 0x7FF;
            (id, is_ext)
        };

        let direction = parts[4];
        let is_tx = direction.eq_ignore_ascii_case("Tx");

        let is_remote = parts[7].eq_ignore_ascii_case("r");

        let byte_count: usize = parts[9].parse().map_err(|_| ())?;

        let expected_data_parts = if is_remote { 0 } else { byte_count };
        let data_start = 10;

        if parts.len() < data_start + expected_data_parts {
            return Err(());
        }

        let mut data = [0u8; 64];
        for (i, hex_str) in parts[data_start..data_start + expected_data_parts]
            .iter()
            .enumerate()
        {
            data[i] = u8::from_str_radix(hex_str, 16).map_err(|_| ())?;
        }

        Ok(CanFrame {
            timestamp,
            bus_id,
            can_id,
            is_extended,
            is_remote,
            is_fd: true,
            is_tx,
            // CAN FD 的 DLC 是编码值(0-15)，需用 byte_count 作为实际数据长度
            dlc: byte_count as u8,
            data,
        })
    }
}

impl CanFrameStream for AscReader {
    fn next(&mut self) -> Result<Option<CanFrame>, SeekError> {
        if self.page.is_empty() && self.cursor < self.frame_count() {
            let connection = self
                .connection
                .lock()
                .map_err(|e| SeekError::IoError(e.to_string()))?;
            let mut statement = connection
                .prepare(
                    "SELECT timestamp, bus_id, can_id, flags, dlc, data
                     FROM frames WHERE seq >= ?1 ORDER BY seq LIMIT ?2",
                )
                .map_err(|e| SeekError::IoError(e.to_string()))?;
            let rows = statement
                .query_map(
                    params![self.cursor as i64, READ_PAGE_SIZE as i64],
                    Self::frame_from_row,
                )
                .map_err(|e| SeekError::IoError(e.to_string()))?;
            for row in rows {
                self.page
                    .push_back(row.map_err(|e| SeekError::IoError(e.to_string()))?);
            }
        }
        let frame = self.page.pop_front();
        if frame.is_some() {
            self.cursor += 1;
        }
        Ok(frame)
    }

    fn seek(&mut self, timestamp: f64) -> Result<(), SeekError> {
        let connection = self
            .connection
            .lock()
            .map_err(|e| SeekError::IoError(e.to_string()))?;
        self.cursor = connection
            .query_row(
                "SELECT seq FROM frames WHERE timestamp >= ?1 ORDER BY timestamp, seq LIMIT 1",
                [timestamp],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| SeekError::IoError(e.to_string()))?
            .map(|seq| seq as u64)
            .unwrap_or_else(|| self.frame_count());
        self.page.clear();
        Ok(())
    }

    fn metadata(&self) -> &StreamMetadata {
        &self.metadata
    }

    fn timestamp_origin(&self) -> f64 {
        self.timestamp_origin
    }

    fn progress(&self) -> Option<f64> {
        let total = self.frame_count();
        if total == 0 {
            return Some(0.0);
        }
        Some(self.cursor as f64 / total as f64)
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use canscope_core::CanFrameStream;

    use crate::AscReader;

    fn write_temp_asc(name: &str, content: &str) -> String {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("canscope_test_{}_{}.asc", std::process::id(), name));
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn parse_simple_asc() {
        let asc = r#"date Wed Dec 31 00:00:00 2025
base hex  timestamps absolute
internal events logged
Begin Triggerblock Wed Dec 31 00:00:00 2025
   0.000000 1  100             Rx   d 8 11 22 33 44 55 66 77 88
   0.010000 1  200             Rx   d 4 AA BB CC DD
   0.020000 1  1A0             Rx   d 3 01 02 03
End Triggerblock
"#;
        let path = write_temp_asc("simple", asc);
        let mut reader = AscReader::open(&path).unwrap();

        let meta = reader.metadata();
        assert_eq!(meta.bus_count, 1);
        assert_eq!(meta.total_frames, Some(3));
        assert!(meta.duration.is_some());

        let f1 = reader.next().unwrap().unwrap();
        assert!((f1.timestamp - 0.000000).abs() < 1e-9);
        assert_eq!(f1.bus_id, 0);
        assert_eq!(f1.can_id, 0x100);
        assert!(!f1.is_extended);
        assert!(!f1.is_remote);
        assert_eq!(f1.dlc, 8);
        assert_eq!(
            &f1.payload()[..8],
            &[0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]
        );

        let f2 = reader.next().unwrap().unwrap();
        assert_eq!(f2.can_id, 0x200);
        assert_eq!(f2.dlc, 4);
        assert_eq!(&f2.payload()[..4], &[0xAA, 0xBB, 0xCC, 0xDD]);

        let f3 = reader.next().unwrap().unwrap();
        assert_eq!(f3.can_id, 0x1A0);
        assert_eq!(f3.dlc, 3);

        assert!(reader.next().unwrap().is_none());
    }

    #[test]
    fn duration_is_relative_to_first_frame_timestamp() {
        let asc = r#"date Wed Dec 31 00:00:00 2025
base hex  timestamps absolute
Begin Triggerblock Wed Dec 31 00:00:00 2025
  10.000000 1  100             Rx   d 1 AA
  12.500000 1  200             Rx   d 1 BB
End Triggerblock
"#;
        let path = write_temp_asc("nonzero_origin", asc);
        let mut reader = AscReader::open(&path).unwrap();

        assert_eq!(reader.timestamp_origin(), 10.0);
        assert_eq!(reader.metadata().duration, Some(2.5));
        assert_eq!(reader.next().unwrap().unwrap().timestamp, 10.0);
    }

    #[test]
    fn parse_extended_frame() {
        let asc = r#"date Wed Dec 31 00:00:00 2025
base hex  timestamps absolute
Begin Triggerblock Wed Dec 31 00:00:00 2025
   0.000000 1  1000x            Rx   d 8 00 00 00 00 00 00 00 00
   0.001000 1  1FFFFFFF         Rx   d 1 FF
End Triggerblock
"#;
        let path = write_temp_asc("extended", asc);
        let mut reader = AscReader::open(&path).unwrap();

        let f1 = reader.next().unwrap().unwrap();
        assert_eq!(f1.can_id, 0x1000);
        assert!(f1.is_extended);

        let f2 = reader.next().unwrap().unwrap();
        assert_eq!(f2.can_id, 0x1FFFFFFF);
        assert!(f2.is_extended);
    }

    #[test]
    fn parse_remote_frame() {
        let asc = r#"date Wed Dec 31 00:00:00 2025
base hex  timestamps absolute
Begin Triggerblock Wed Dec 31 00:00:00 2025
   0.000000 1  100             Rx   r 4
End Triggerblock
"#;
        let path = write_temp_asc("remote", asc);
        let mut reader = AscReader::open(&path).unwrap();

        let f = reader.next().unwrap().unwrap();
        assert!(f.is_remote);
        assert_eq!(f.dlc, 4);
    }

    #[test]
    fn parse_sample_trace() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("examples")
            .join("sample_trace.asc");
        assert!(path.exists(), "sample_trace.asc not found at {:?}", path);

        let mut reader = AscReader::open(&path).unwrap();
        let mut frames = Vec::new();
        while let Some(f) = reader.next().unwrap() {
            frames.push(f);
        }

        assert_eq!(frames.len(), 25, "expected 25 frames");

        let meta = reader.metadata();
        assert_eq!(meta.total_frames, Some(25));
        assert_eq!(meta.bus_count, 2);

        let f_ext = frames.iter().find(|f| f.can_id == 0x350).unwrap();
        assert!(f_ext.is_extended, "0x350 should be extended frame");

        let f_ch2 = frames.iter().find(|f| f.bus_id == 1).unwrap();
        assert_eq!(f_ch2.can_id, 0x200, "channel 2 should have SteeringInfo");
    }

    #[test]
    fn seek_and_progress() {
        let asc = r#"date Wed Dec 31 00:00:00 2025
base hex  timestamps absolute
Begin Triggerblock Wed Dec 31 00:00:00 2025
   0.000000 1  100             Rx   d 1 00
   0.010000 1  100             Rx   d 1 01
   0.020000 1  100             Rx   d 1 02
   0.030000 1  100             Rx   d 1 03
End Triggerblock
"#;
        let path = write_temp_asc("seek", asc);
        let mut reader = AscReader::open(&path).unwrap();

        reader.seek(0.015).unwrap();
        let f = reader.next().unwrap().unwrap();
        assert!((f.timestamp - 0.020000).abs() < 1e-6);

        reader.seek(0.0).unwrap();
        let progress = reader.progress().unwrap();
        assert!((progress - 0.0).abs() < 1e-9);
    }

    #[test]
    fn sqlite_index_is_reused_and_pages_are_filtered() {
        let asc = r#"Begin Triggerblock
0.000000 1 100 Rx d 1 00
0.010000 1 200 Rx d 1 01
0.020000 1 100 Rx d 1 02
End Triggerblock
"#;
        let path = write_temp_asc("sqlite_page", asc);
        let cache_dir = std::env::temp_dir().join(format!(
            "canscope_index_test_{}_{}",
            std::process::id(),
            "sqlite_page"
        ));
        let mut progress = Vec::new();
        let reader = AscReader::open_with_cache_and_progress(&path, &cache_dir, |count| {
            progress.push(count);
            Ok(())
        })
        .unwrap();
        assert_eq!(reader.frame_count(), 3);
        assert!(!progress.is_empty());

        let (total, frames) = reader.query_page(1, 1, Some(0x100), None, None).unwrap();
        assert_eq!(total, 2);
        assert_eq!(frames.len(), 1);
        assert!((frames[0].timestamp - 0.02).abs() < 1e-9);

        drop(reader);
        let mut reused_progress = Vec::new();
        let reused = AscReader::open_with_cache_and_progress(&path, &cache_dir, |count| {
            reused_progress.push(count);
            Ok(())
        })
        .unwrap();
        assert_eq!(reused.frame_count(), 3);
        assert!(reused_progress.is_empty());
    }
}
