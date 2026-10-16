use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use canscope_core::{
    BusType, CanFrame, CanFrameStream, FileFormat, SeekError, SourceType, StreamMetadata,
};

use crate::error::ParseError;

/// ASC 格式读取器（全量加载到内存）。
///
/// Phase 1 MVP：大文件（<500MB）直接全量加载，后续可改为索引+分页。
pub struct AscReader {
    metadata: StreamMetadata,
    frames: Vec<CanFrame>,
    cursor: usize,
}

impl AscReader {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, ParseError> {
        let path = path.as_ref();
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

        let mut frames = Vec::new();
        let mut in_triggerblock = false;
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

            if !in_triggerblock {
                if let Some(date_str) = trimmed.strip_prefix("date ") {
                    metadata.start_time = Some(date_str.to_string());
                } else if trimmed.starts_with("Begin Triggerblock") {
                    in_triggerblock = true;
                }
                continue;
            }

            if trimmed.starts_with("End Triggerblock") {
                break;
            }

            let frame =
                Self::parse_frame_line(trimmed).map_err(|()| ParseError::InvalidFrame {
                    line: line_num,
                    text: trimmed.to_string(),
                })?;

            max_bus = max_bus.max(frame.bus_id.saturating_add(1));
            frames.push(frame);
        }

        metadata.bus_count = max_bus;
        metadata.total_frames = Some(frames.len() as u64);
        metadata.duration = frames.last().map(|f| f.timestamp);

        Ok(Self {
            metadata,
            frames,
            cursor: 0,
        })
    }

    /// 解析一行 ASC CAN 帧。
    ///
    /// 格式：`<timestamp> <channel> <can_id>[x] Rx|Tx d|r <dlc> [<hex_byte>...]`
    ///
    /// - `can_id` 后缀 `x` 表示扩展帧；标准帧无后缀
    /// - `d` = data frame, `r` = remote frame
    fn parse_frame_line(line: &str) -> Result<CanFrame, ()> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            return Err(());
        }

        let timestamp: f64 = parts[0].parse().map_err(|_| ())?;

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

        let (is_remote, is_fd) = match parts[4] {
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
            is_fd,
            is_tx,
            dlc,
            data,
        })
    }
}

impl CanFrameStream for AscReader {
    fn next(&mut self) -> Option<CanFrame> {
        if self.cursor >= self.frames.len() {
            return None;
        }
        let frame = self.frames[self.cursor].clone();
        self.cursor += 1;
        Some(frame)
    }

    fn seek(&mut self, timestamp: f64) -> Result<(), SeekError> {
        let pos = self
            .frames
            .binary_search_by(|f| {
                f.timestamp
                    .partial_cmp(&timestamp)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

        self.cursor = match pos {
            Ok(idx) => idx,
            Err(idx) => idx,
        };
        Ok(())
    }

    fn metadata(&self) -> &StreamMetadata {
        &self.metadata
    }

    fn progress(&self) -> Option<f64> {
        if self.frames.is_empty() {
            return Some(0.0);
        }
        Some(self.cursor as f64 / self.frames.len() as f64)
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

        let f1 = reader.next().unwrap();
        assert!((f1.timestamp - 0.000000).abs() < 1e-9);
        assert_eq!(f1.bus_id, 0);
        assert_eq!(f1.can_id, 0x100);
        assert!(!f1.is_extended);
        assert!(!f1.is_remote);
        assert_eq!(f1.dlc, 8);
        assert_eq!(&f1.payload()[..8], &[0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);

        let f2 = reader.next().unwrap();
        assert_eq!(f2.can_id, 0x200);
        assert_eq!(f2.dlc, 4);
        assert_eq!(&f2.payload()[..4], &[0xAA, 0xBB, 0xCC, 0xDD]);

        let f3 = reader.next().unwrap();
        assert_eq!(f3.can_id, 0x1A0);
        assert_eq!(f3.dlc, 3);

        assert!(reader.next().is_none());
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

        let f1 = reader.next().unwrap();
        assert_eq!(f1.can_id, 0x1000);
        assert!(f1.is_extended);

        let f2 = reader.next().unwrap();
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

        let f = reader.next().unwrap();
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
        assert!(
            path.exists(),
            "sample_trace.asc not found at {:?}",
            path
        );

        let mut reader = AscReader::open(&path).unwrap();
        let mut frames = Vec::new();
        while let Some(f) = reader.next() {
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
        let f = reader.next().unwrap();
        assert!((f.timestamp - 0.020000).abs() < 1e-6);

        reader.seek(0.0).unwrap();
        let progress = reader.progress().unwrap();
        assert!((progress - 0.0).abs() < 1e-9);
    }
}