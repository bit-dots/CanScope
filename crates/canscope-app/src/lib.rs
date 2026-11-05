use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

use canscope_core::{CanFrame, CanFrameStream};
use canscope_dbc::{Dbc, DbcMessage, DbcSignal, DecodedSignal};
use canscope_parser::asc::AscReader;
use canscope_playback::{
    PlaybackEngine, PlaybackFrame, PlaybackState, PlaylistEngine, PlaylistEntry,
};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

const MAX_RECENT_PROJECTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilterConfigJson {
    can_id: String,
    time_start: String,
    time_end: String,
}

impl Default for FilterConfigJson {
    fn default() -> Self {
        Self {
            can_id: String::new(),
            time_start: String::new(),
            time_end: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChartSignalJson {
    can_id: u32,
    signal_name: String,
    unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiLayoutJson {
    panel_width: f64,
    chart_height: f64,
    #[serde(default)]
    panels: Vec<PanelLayoutJson>,
}

impl Default for UiLayoutJson {
    fn default() -> Self {
        Self {
            panel_width: 260.0,
            chart_height: 200.0,
            panels: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PanelLayoutJson {
    id: String,
    visible: bool,
    minimized: bool,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    z_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbcBinding {
    bus_id: u8,
    path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectConfig {
    name: String,
    can_log_path: Option<String>,
    dbc_bindings: Vec<DbcBinding>,
    last_position: f64,
    filters: FilterConfigJson,
    chart_signals: Vec<ChartSignalJson>,
    #[serde(default)]
    ui_layout: UiLayoutJson,
    created_at: String,
    modified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecentProjectEntry {
    name: String,
    path: String,
    opened_at: String,
}

struct AppState {
    engine: Mutex<Option<PlaylistEngine<AscReader>>>,
    dbc_map: Mutex<HashMap<u8, Dbc>>,
    runtime_log_write_lock: Mutex<()>,
    file_path: Mutex<Option<PathBuf>>,
    project: Mutex<Option<ProjectConfig>>,
    project_path: Mutex<Option<PathBuf>>,
    dirty: Mutex<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DecodedSignalInfo {
    name: String,
    physical_value: f64,
    unit: String,
    label: Option<String>,
}

impl From<&DecodedSignal> for DecodedSignalInfo {
    fn from(s: &DecodedSignal) -> Self {
        Self {
            name: s.name.clone(),
            physical_value: s.physical_value,
            unit: s.unit.clone(),
            label: s.label.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbcSignalInfo {
    name: String,
    start_bit: u8,
    bit_length: u8,
    byte_order: String,
    unit: String,
    min: Option<f64>,
    max: Option<f64>,
    multiplexer: String,
}

impl From<&DbcSignal> for DbcSignalInfo {
    fn from(s: &DbcSignal) -> Self {
        Self {
            name: s.name.clone(),
            start_bit: s.start_bit,
            bit_length: s.bit_length,
            byte_order: format!("{:?}", s.byte_order),
            unit: s.unit.clone(),
            min: s.min,
            max: s.max,
            multiplexer: format!("{:?}", s.multiplexer),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbcMessageInfo {
    bus_id: u8,
    can_id: u32,
    name: String,
    dlc: u8,
    sender: String,
    signals: Vec<DbcSignalInfo>,
    signal_count: usize,
}

impl DbcMessageInfo {
    fn from_message(bus_id: u8, m: &DbcMessage) -> Self {
        Self {
            bus_id,
            can_id: m.can_id,
            name: m.name.clone(),
            dlc: m.dlc,
            sender: m.sender.clone(),
            signal_count: m.signals.len(),
            signals: m.signals.iter().map(DbcSignalInfo::from).collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbcTreeInfo {
    messages: Vec<DbcMessageInfo>,
    message_count: usize,
    signal_count: usize,
}

#[tauri::command]
fn get_dbc_info(state: State<AppState>) -> Result<Option<DbcTreeInfo>, String> {
    let dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    if dbc_map.is_empty() {
        return Ok(None);
    }
    let mut messages: Vec<DbcMessageInfo> = Vec::new();
    for (&bus_id, dbc) in dbc_map.iter() {
        for m in &dbc.messages {
            messages.push(DbcMessageInfo::from_message(bus_id, m));
        }
    }
    let signal_count: usize = messages.iter().map(|m| m.signal_count).sum();
    Ok(Some(DbcTreeInfo {
        message_count: messages.len(),
        signal_count,
        messages,
    }))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbcDetailInfo {
    messages: Vec<DbcMessageDetail>,
    nodes: Vec<DbcNodeDetail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbcMessageDetail {
    can_id: u32,
    name: String,
    dlc: u8,
    sender: String,
    signal_count: usize,
    signals: Vec<DbcSignalInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DbcNodeDetail {
    name: String,
    message_count: usize,
    signal_count: usize,
    messages: Vec<DbcMessageDetail>,
}

#[tauri::command]
fn get_dbc_detail(path: String) -> Result<DbcDetailInfo, String> {
    use std::collections::BTreeMap;

    let dbc = canscope_dbc::parse_dbc(&path).map_err(|e| format!("Failed to parse DBC: {}", e))?;

    let messages: Vec<DbcMessageDetail> = dbc
        .messages
        .iter()
        .map(|m| DbcMessageDetail {
            can_id: m.can_id,
            name: m.name.clone(),
            dlc: m.dlc,
            sender: m.sender.clone(),
            signal_count: m.signals.len(),
            signals: m.signals.iter().map(DbcSignalInfo::from).collect(),
        })
        .collect();

    let mut node_messages: BTreeMap<String, Vec<DbcMessageDetail>> = BTreeMap::new();
    for m in &dbc.messages {
        let entry = node_messages.entry(m.sender.clone()).or_default();
        entry.push(DbcMessageDetail {
            can_id: m.can_id,
            name: m.name.clone(),
            dlc: m.dlc,
            sender: m.sender.clone(),
            signal_count: m.signals.len(),
            signals: m.signals.iter().map(DbcSignalInfo::from).collect(),
        });
    }

    let mut nodes: Vec<DbcNodeDetail> = Vec::new();
    for node_name in &dbc.nodes {
        let msgs = node_messages.remove(node_name).unwrap_or_default();
        let signal_count: usize = msgs.iter().map(|m| m.signal_count).sum();
        nodes.push(DbcNodeDetail {
            name: node_name.clone(),
            message_count: msgs.len(),
            signal_count,
            messages: msgs,
        });
    }
    for (sender, msgs) in node_messages {
        let signal_count: usize = msgs.iter().map(|m| m.signal_count).sum();
        nodes.push(DbcNodeDetail {
            name: sender,
            message_count: msgs.len(),
            signal_count,
            messages: msgs,
        });
    }

    Ok(DbcDetailInfo { messages, nodes })
}

#[derive(Debug, Clone, Serialize)]
struct FrameInfo {
    timestamp: f64,
    bus_id: u8,
    can_id: u32,
    is_extended: bool,
    is_fd: bool,
    is_brs: bool,
    is_error: bool,
    is_tx: bool,
    dlc: u8,
    #[serde(with = "serde_bytes")]
    data: Vec<u8>,
    message_name: Option<String>,
    relative_time: Option<f64>,
    signals: Option<Vec<DecodedSignalInfo>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistFileInfo {
    index: usize,
    file_name: String,
    file_path: String,
    enabled: bool,
    duration: Option<f64>,
    total_frames: Option<u64>,
    start_time: Option<String>,
    timestamp_origin: f64,
    start_offset: f64,
    end_offset: Option<f64>,
    play_start_offset: f64,
    play_end_offset: Option<f64>,
    bus_count: u8,
    bus_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistInfo {
    files: Vec<PlaylistFileInfo>,
    total_duration: Option<f64>,
    total_frames: Option<u64>,
    file_count: usize,
    enabled_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FramePage {
    offset: u64,
    total_count: u64,
    time_origin: f64,
    frames: Vec<FrameInfo>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FrameTableFilter {
    time: String,
    channel: String,
    can_id: String,
    frame_type: String,
    direction: String,
    dlc: String,
    data: String,
    name: String,
    time_format: String,
    start_time_of_day_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChartSignalQuery {
    can_id: u32,
    signal_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChartData {
    timestamps: Vec<f64>,
    series: Vec<Vec<Option<f64>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrameIndexProgress {
    path: String,
    status: String,
    processed_frames: u64,
    message: Option<String>,
}

#[derive(Clone)]
struct FrameSource {
    path: PathBuf,
    global_offset: f64,
    duration: Option<f64>,
}

fn frame_sources(state: &AppState) -> Result<Vec<FrameSource>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let Some(playlist) = engine.as_ref() else {
        return Ok(Vec::new());
    };
    Ok(playlist
        .entries()
        .iter()
        .filter(|entry| entry.enabled)
        .map(|entry| FrameSource {
            path: PathBuf::from(&entry.file_path),
            global_offset: entry.global_start_offset,
            duration: entry.engine.metadata().duration,
        })
        .collect())
}

fn frame_index_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?
        .join("frame-index");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create frame index directory: {}", e))?;
    Ok(dir)
}

fn open_indexed_asc(app: &tauri::AppHandle, path: &Path) -> Result<AscReader, String> {
    let cache_dir = frame_index_dir(app)?;
    let source_path = path.to_string_lossy().to_string();
    app.emit(
        "frame-index-progress",
        FrameIndexProgress {
            path: source_path.clone(),
            status: "indexing".into(),
            processed_frames: 0,
            message: None,
        },
    )
    .map_err(|e| format!("Failed to notify index progress: {}", e))?;

    match AscReader::open_with_cache_and_progress(path, &cache_dir, |processed_frames| {
        app.emit(
            "frame-index-progress",
            FrameIndexProgress {
                path: source_path.clone(),
                status: "indexing".into(),
                processed_frames,
                message: None,
            },
        )
        .map_err(|e| e.to_string())
    }) {
        Ok(reader) => {
            app.emit(
                "frame-index-progress",
                FrameIndexProgress {
                    path: source_path,
                    status: "ready".into(),
                    processed_frames: reader.frame_count(),
                    message: None,
                },
            )
            .map_err(|e| format!("Failed to notify index completion: {}", e))?;
            Ok(reader)
        }
        Err(error) => {
            let message = error.to_string();
            app.emit(
                "frame-index-progress",
                FrameIndexProgress {
                    path: source_path,
                    status: "failed".into(),
                    processed_frames: 0,
                    message: Some(message.clone()),
                },
            )
            .map_err(|e| format!("{}; failed to notify index error: {}", message, e))?;
            Err(message)
        }
    }
}

fn build_playlist_info(playlist: &PlaylistEngine<AscReader>) -> PlaylistInfo {
    let files: Vec<PlaylistFileInfo> = playlist
        .entries()
        .iter()
        .enumerate()
        .map(|(i, e)| PlaylistFileInfo {
            index: i,
            file_name: e.file_name.clone(),
            file_path: e.file_path.clone(),
            enabled: e.enabled,
            duration: e.engine.metadata().duration,
            total_frames: e.engine.total_frames(),
            start_time: e.engine.metadata().start_time.clone(),
            timestamp_origin: e.engine.stream().timestamp_origin(),
            start_offset: e.global_start_offset,
            end_offset: e.global_end_offset,
            play_start_offset: e.play_start_offset,
            play_end_offset: e.play_end_offset,
            bus_count: e.engine.metadata().bus_count,
            bus_type: format!("{:?}", e.engine.metadata().bus_type),
        })
        .collect();

    let enabled_count = files.iter().filter(|f| f.enabled).count();

    PlaylistInfo {
        file_count: files.len(),
        enabled_count,
        files,
        total_duration: playlist.total_duration(),
        total_frames: playlist.total_frames(),
    }
}

fn build_playlist_info_from_state(
    engine_guard: &std::sync::MutexGuard<'_, Option<PlaylistEngine<AscReader>>>,
) -> Option<PlaylistInfo> {
    engine_guard.as_ref().map(|p| build_playlist_info(p))
}

fn frame_to_info(f: &PlaybackFrame) -> FrameInfo {
    let dlc = f.dlc as usize;
    FrameInfo {
        timestamp: f.timestamp,
        bus_id: f.bus_id,
        can_id: f.can_id,
        is_extended: f.is_extended,
        is_fd: f.is_fd,
        is_brs: f.is_brs,
        is_error: f.is_error,
        is_tx: f.is_tx,
        dlc: f.dlc,
        data: f.data[..dlc.min(64)].to_vec(),
        message_name: f.message_name.clone(),
        relative_time: None,
        signals: f
            .signals
            .as_ref()
            .map(|sigs| sigs.iter().map(DecodedSignalInfo::from).collect()),
    }
}

#[tauri::command]
fn reload_all_dbc(bindings: Vec<DbcBinding>, state: State<AppState>) -> Result<String, String> {
    let mut new_map: HashMap<u8, Dbc> = HashMap::new();
    let mut loaded = 0usize;
    let mut failed = Vec::new();

    for binding in &bindings {
        match canscope_dbc::parse_dbc(&PathBuf::from(&binding.path)) {
            Ok(dbc) => {
                new_map.insert(binding.bus_id, dbc);
                loaded += 1;
            }
            Err(e) => {
                failed.push(format!("{}: {}", binding.path, e));
            }
        }
    }

    let mut dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    *dbc_map = new_map;
    drop(dbc_map);

    if failed.is_empty() {
        Ok(format!("Loaded {} DBC file(s)", loaded))
    } else {
        Ok(format!(
            "Loaded {} DBC file(s), {} failed: {}",
            loaded,
            failed.len(),
            failed.join("; ")
        ))
    }
}

#[tauri::command]
fn load_dbc(path: String, bus_id: u8, state: State<AppState>) -> Result<String, String> {
    let dbc = canscope_dbc::parse_dbc(&PathBuf::from(&path)).map_err(|e| e.to_string())?;
    let msg_count = dbc.messages.len();
    let signal_count: usize = dbc.messages.iter().map(|m| m.signals.len()).sum();

    let mut dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    dbc_map.insert(bus_id, dbc);

    Ok(format!(
        "Loaded DBC for channel {}: {} messages, {} signals",
        bus_id, msg_count, signal_count
    ))
}

#[tauri::command]
fn get_batch(app: tauri::AppHandle, state: State<AppState>) -> Result<Vec<FrameInfo>, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    let dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut playlist) = *engine_guard {
        playlist.set_dbcs(dbc_map.clone());
        let was_playing = playlist.state() == PlaybackState::Playing;
        let batch = playlist
            .next_batch_timed(1024, Instant::now())
            .map_err(|e| e.to_string())?;

        if was_playing && playlist.state() == PlaybackState::Stopped {
            let _ = app.emit("playback-state-changed", "stopped");
        }

        Ok(batch.iter().map(frame_to_info).collect())
    } else {
        Ok(Vec::new())
    }
}

impl FrameTableFilter {
    fn is_active(&self) -> bool {
        [
            &self.time,
            &self.channel,
            &self.can_id,
            &self.frame_type,
            &self.direction,
            &self.dlc,
            &self.data,
            &self.name,
        ]
        .iter()
        .any(|value| !value.trim().is_empty())
    }
}

fn format_frame_time(
    timestamp: f64,
    previous_timestamp: Option<f64>,
    time_origin: f64,
    filter: &FrameTableFilter,
) -> String {
    match filter.time_format.as_str() {
        "relative-to-start" => format!("{:.6}", timestamp - time_origin),
        "relative-to-prev" => format!(
            "{:.6}",
            previous_timestamp.map_or(0.0, |previous| timestamp - previous)
        ),
        _ => {
            if let Some(start_ms) = filter.start_time_of_day_ms {
                let millis = (start_ms as f64 + timestamp * 1000.0).trunc();
                let day_millis = millis.rem_euclid(86_400_000.0) as u64;
                let hour = day_millis / 3_600_000;
                let minute = day_millis / 60_000 % 60;
                let second = day_millis / 1_000 % 60;
                let millisecond = day_millis % 1_000;
                format!("{hour:02}:{minute:02}:{second:02}.{millisecond:03}")
            } else {
                let hours = (timestamp / 3600.0).floor();
                let minutes = (timestamp % 3600.0 / 60.0).floor();
                let seconds = timestamp % 60.0;
                format!("{hours:02}:{minutes:02}:{seconds:06.3}")
            }
        }
    }
}

fn matches_frame_table_filter(
    frame: &CanFrame,
    message_name: Option<&str>,
    timestamp: f64,
    previous_timestamp: Option<f64>,
    time_origin: f64,
    filter: &FrameTableFilter,
) -> bool {
    let can_id_filter = filter.can_id.trim().to_ascii_lowercase();
    if !can_id_filter.is_empty() {
        let hex_id = format!(
            "{:0width$X}",
            frame.can_id,
            width = if frame.is_extended { 8 } else { 3 }
        )
        .to_ascii_lowercase();
        let hex_prefix = can_id_filter.strip_prefix("0x").unwrap_or(&can_id_filter);
        if !hex_id.starts_with(hex_prefix) && !frame.can_id.to_string().starts_with(&can_id_filter)
        {
            return false;
        }
    }

    let channel_filter = filter.channel.trim().to_ascii_lowercase();
    if !channel_filter.is_empty()
        && !format!("can {}", frame.bus_id + 1).contains(channel_filter.as_str())
    {
        return false;
    }

    match filter.direction.trim() {
        "RX" if frame.is_tx => return false,
        "TX" if !frame.is_tx => return false,
        _ => {}
    }

    let type_filter = filter.frame_type.trim();
    if !type_filter.is_empty() {
        let frame_type = if frame.is_error {
            "ErrorFrame"
        } else if frame.is_fd {
            if frame.is_brs {
                "CAN FD(加速)"
            } else {
                "CAN FD"
            }
        } else {
            "CAN"
        };
        if frame_type != type_filter {
            return false;
        }
    }

    let dlc_filter = filter.dlc.trim();
    if !dlc_filter.is_empty() && frame.dlc.to_string() != dlc_filter {
        return false;
    }

    let data_filter = filter
        .data
        .trim()
        .chars()
        .filter(|character| !character.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    if !data_filter.is_empty() {
        let data = frame
            .data
            .iter()
            .take(frame.dlc as usize)
            .map(|byte| format!("{byte:02X}"))
            .collect::<String>()
            .to_ascii_lowercase();
        if !data.contains(&data_filter) {
            return false;
        }
    }

    let name_filter = filter.name.trim().to_lowercase();
    if !name_filter.is_empty()
        && !message_name
            .unwrap_or_default()
            .to_lowercase()
            .contains(&name_filter)
    {
        return false;
    }

    let time_filter = filter.time.trim().to_ascii_lowercase();
    if !time_filter.is_empty()
        && !format_frame_time(timestamp, previous_timestamp, time_origin, filter)
            .to_ascii_lowercase()
            .contains(&time_filter)
    {
        return false;
    }

    true
}

#[tauri::command]
fn get_frame_page(
    app: tauri::AppHandle,
    offset: u64,
    limit: usize,
    can_id: Option<u32>,
    time_start: Option<f64>,
    time_end: Option<f64>,
    table_filter: Option<FrameTableFilter>,
    playback_time: Option<f64>,
    state: State<AppState>,
) -> Result<FramePage, String> {
    let sources = frame_sources(&state)?;
    let cache_dir = frame_index_dir(&app)?;
    let limit = limit.min(if playback_time.is_some() { 4096 } else { 512 });
    let time_end = match (time_end, playback_time) {
        (Some(filter_end), Some(playback_time)) => Some(filter_end.min(playback_time)),
        (Some(filter_end), None) => Some(filter_end),
        (None, playback_time) => playback_time,
    };
    if let Some(filter) = table_filter.filter(FrameTableFilter::is_active) {
        let dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
        let mut frames = Vec::with_capacity(limit);
        let mut total_count = 0u64;
        let mut time_origin = None;
        let mut previous_timestamp = None;

        for source in sources {
            let reader =
                AscReader::open_with_cache(&source.path, &cache_dir).map_err(|e| e.to_string())?;
            let mut source_offset = 0u64;
            loop {
                let (_, page) = reader
                    .query_page(source_offset, 512, None, None, None)
                    .map_err(|e| e.to_string())?;
                if page.is_empty() {
                    break;
                }
                source_offset += page.len() as u64;

                for mut frame in page {
                    let timestamp = frame.timestamp + source.global_offset;
                    let origin = *time_origin.get_or_insert(timestamp);
                    let previous = previous_timestamp;
                    previous_timestamp = Some(timestamp);
                    frame.timestamp = timestamp;

                    if can_id.map_or(false, |id| frame.can_id != id)
                        || time_start.map_or(false, |start| timestamp < start)
                        || time_end.map_or(false, |end| timestamp > end)
                    {
                        continue;
                    }

                    let dbc = dbc_map.get(&frame.bus_id);
                    let message_name = if frame.is_error {
                        None
                    } else {
                        dbc.and_then(|dbc| dbc.get_message(frame.can_id))
                            .map(|message| message.name.as_str())
                    };
                    if !matches_frame_table_filter(
                        &frame,
                        message_name,
                        timestamp,
                        previous,
                        origin,
                        &filter,
                    ) {
                        continue;
                    }

                    if total_count >= offset && frames.len() < limit {
                        let decoded = dbc
                            .filter(|_| !frame.is_error)
                            .and_then(|dbc| dbc.decode_frame(&frame).ok());
                        let message_name = message_name.map(str::to_owned);
                        let playback_frame = PlaybackFrame {
                            timestamp,
                            bus_id: frame.bus_id,
                            can_id: frame.can_id,
                            is_extended: frame.is_extended,
                            is_fd: frame.is_fd,
                            is_brs: frame.is_brs,
                            is_error: frame.is_error,
                            is_tx: frame.is_tx,
                            dlc: frame.dlc,
                            data: std::sync::Arc::new(frame.data),
                            message_name,
                            signals: decoded,
                        };
                        let mut frame_info = frame_to_info(&playback_frame);
                        frame_info.relative_time =
                            Some(previous.map_or(0.0, |previous| timestamp - previous));
                        frames.push(frame_info);
                    }
                    total_count += 1;
                }
            }
        }

        return Ok(FramePage {
            offset,
            total_count,
            time_origin: time_origin.unwrap_or(0.0),
            frames,
        });
    }

    let mut indexed_sources = Vec::with_capacity(sources.len());
    let mut total_count = 0;
    let mut time_origin = None;

    for source in sources {
        let reader =
            AscReader::open_with_cache(&source.path, &cache_dir).map_err(|e| e.to_string())?;
        if time_origin.is_none() {
            let (_, first_frame) = reader
                .query_page(0, 1, None, None, None)
                .map_err(|e| e.to_string())?;
            time_origin = first_frame
                .first()
                .map(|frame| frame.timestamp + source.global_offset);
        }
        let local_start = time_start.map(|t| (t - source.global_offset).max(0.0));
        let local_end = time_end
            .map(|t| t - source.global_offset)
            .or(source.duration);
        if local_end.map_or(false, |end| end < 0.0)
            || local_start
                .zip(local_end)
                .map_or(false, |(start, end)| start > end)
        {
            continue;
        }
        let (source_count, _) = reader
            .query_page(0, 0, can_id, local_start, local_end)
            .map_err(|e| e.to_string())?;
        total_count += source_count;
        indexed_sources.push((reader, source, source_count, local_start, local_end));
    }

    let page_offset = offset;
    let mut frames = Vec::with_capacity(limit);
    let mut skip = page_offset;

    for (reader, source, source_count, local_start, local_end) in indexed_sources {
        if skip >= source_count {
            skip -= source_count;
            continue;
        }
        if frames.len() >= limit {
            continue;
        }
        let page_size = (limit - frames.len()).min((source_count - skip) as usize);
        let (_, mut page) = reader
            .query_page(skip, page_size, can_id, local_start, local_end)
            .map_err(|e| e.to_string())?;
        for frame in &mut page {
            frame.timestamp += source.global_offset;
        }
        frames.extend(page);
        skip = 0;
    }

    let dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    let frames = frames
        .iter()
        .map(|frame| {
            let dbc = dbc_map.get(&frame.bus_id);
            let decoded = dbc
                .filter(|_| !frame.is_error)
                .and_then(|dbc| dbc.decode_frame(frame).ok());
            let message_name = dbc
                .filter(|_| !frame.is_error)
                .and_then(|dbc| dbc.get_message(frame.can_id))
                .map(|message| message.name.clone());
            let playback_frame = PlaybackFrame {
                timestamp: frame.timestamp,
                bus_id: frame.bus_id,
                can_id: frame.can_id,
                is_extended: frame.is_extended,
                is_fd: frame.is_fd,
                is_brs: frame.is_brs,
                is_error: frame.is_error,
                is_tx: frame.is_tx,
                dlc: frame.dlc,
                data: std::sync::Arc::new(frame.data),
                message_name,
                signals: decoded,
            };
            frame_to_info(&playback_frame)
        })
        .collect();
    Ok(FramePage {
        offset: page_offset,
        total_count,
        time_origin: time_origin.unwrap_or(0.0),
        frames,
    })
}

#[tauri::command]
fn get_chart_data(
    app: tauri::AppHandle,
    signals: Vec<ChartSignalQuery>,
    time_start: f64,
    time_end: f64,
    bucket_count: usize,
    state: State<AppState>,
) -> Result<ChartData, String> {
    if !time_start.is_finite() || !time_end.is_finite() || time_end < time_start {
        return Err("Invalid chart time range".into());
    }
    if signals.is_empty() || bucket_count == 0 {
        return Ok(ChartData {
            timestamps: Vec::new(),
            series: Vec::new(),
        });
    }
    if signals.len() > 64 {
        return Err("At most 64 signals can be queried at once".into());
    }
    let bucket_count = bucket_count.min(4096);
    let sources = frame_sources(&state)?;
    let cache_dir = frame_index_dir(&app)?;
    let dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?.clone();
    let span = (time_end - time_start).max(f64::EPSILON);
    let mut extrema = vec![vec![None::<(f64, f64)>; bucket_count]; signals.len()];
    let mut signals_by_can_id: HashMap<u32, Vec<usize>> = HashMap::new();
    for (index, signal) in signals.iter().enumerate() {
        signals_by_can_id
            .entry(signal.can_id)
            .or_default()
            .push(index);
    }

    for source in sources {
        let global_end = source.global_offset + source.duration.unwrap_or(f64::MAX);
        if time_end < source.global_offset || time_start > global_end {
            continue;
        }
        let local_start = (time_start - source.global_offset).max(0.0);
        let local_end = (time_end - source.global_offset)
            .max(0.0)
            .min(source.duration.unwrap_or(f64::MAX));
        let reader =
            AscReader::open_with_cache(&source.path, &cache_dir).map_err(|e| e.to_string())?;
        reader
            .for_each_frame(local_start, local_end, |mut frame| {
                frame.timestamp += source.global_offset;
                let Some(signal_indexes) = signals_by_can_id.get(&frame.can_id) else {
                    return Ok(());
                };
                let Some(decoded_signals) = dbc_map
                    .get(&frame.bus_id)
                    .and_then(|dbc| dbc.decode_frame(&frame).ok())
                else {
                    return Ok(());
                };
                for signal_index in signal_indexes {
                    let signal = &signals[*signal_index];
                    let Some(decoded) = decoded_signals
                        .iter()
                        .find(|d| d.name == signal.signal_name)
                    else {
                        continue;
                    };
                    let bucket = (((frame.timestamp - time_start) / span * bucket_count as f64)
                        .floor() as usize)
                        .min(bucket_count - 1);
                    let cell = &mut extrema[*signal_index][bucket];
                    match cell {
                        Some((min, max)) => {
                            *min = min.min(decoded.physical_value);
                            *max = max.max(decoded.physical_value);
                        }
                        None => *cell = Some((decoded.physical_value, decoded.physical_value)),
                    }
                }
                Ok(())
            })
            .map_err(|e| e.to_string())?;
    }

    let bucket_width = span / bucket_count as f64;
    let mut points = Vec::new();
    for (signal_index, buckets) in extrema.into_iter().enumerate() {
        for (bucket, values) in buckets.into_iter().enumerate() {
            if let Some((min, max)) = values {
                let left = time_start + bucket as f64 * bucket_width;
                points.push((left + bucket_width * 0.25, signal_index, min));
                if max != min {
                    points.push((left + bucket_width * 0.75, signal_index, max));
                }
            }
        }
    }
    points.sort_by(|a, b| a.0.total_cmp(&b.0));

    let mut timestamps = Vec::new();
    let mut series: Vec<Vec<Option<f64>>> = (0..signals.len()).map(|_| Vec::new()).collect();
    for (timestamp, signal_index, value) in points {
        if timestamps.last().copied() != Some(timestamp) {
            timestamps.push(timestamp);
            for values in &mut series {
                values.push(None);
            }
        }
        if let Some(last) = series[signal_index].last_mut() {
            *last = Some(value);
        }
    }

    Ok(ChartData { timestamps, series })
}

#[tauri::command]
fn playback_control(action: String, state: State<AppState>) -> Result<String, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut playlist) = *engine_guard {
        match action.as_str() {
            "play" => {
                playlist.play().map_err(|e| e.to_string())?;
                Ok("playing".into())
            }
            "pause" => {
                playlist.pause();
                Ok("paused".into())
            }
            "stop" => {
                playlist.stop();
                Ok("stopped".into())
            }
            _ => Err(format!("Unknown action: {}", action)),
        }
    } else {
        Err("No file loaded".into())
    }
}

#[tauri::command]
fn get_playback_state(state: State<AppState>) -> Result<String, String> {
    let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref playlist) = *engine_guard {
        match playlist.state() {
            PlaybackState::Stopped => Ok("stopped".into()),
            PlaybackState::Playing => Ok("playing".into()),
            PlaybackState::Paused => Ok("paused".into()),
        }
    } else {
        Ok("stopped".into())
    }
}

#[tauri::command]
fn seek_to(timestamp: f64, state: State<AppState>) -> Result<(), String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.seek_to(timestamp).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_progress(state: State<AppState>) -> Result<Option<f64>, String> {
    let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref playlist) = *engine_guard {
        Ok(playlist.progress())
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn get_available_memory_bytes() -> Result<Option<u64>, String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

        let mut status = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            dwMemoryLoad: 0,
            ullTotalPhys: 0,
            ullAvailPhys: 0,
            ullTotalPageFile: 0,
            ullAvailPageFile: 0,
            ullTotalVirtual: 0,
            ullAvailVirtual: 0,
            ullAvailExtendedVirtual: 0,
        };
        let succeeded = unsafe { GlobalMemoryStatusEx(&mut status) };
        if succeeded == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        return Ok(Some(status.ullAvailPhys));
    }

    #[cfg(target_os = "macos")]
    {
        #[link(name = "System")]
        unsafe extern "C" {
            fn mach_port_deallocate(
                task: libc::mach_port_t,
                name: libc::mach_port_t,
            ) -> libc::kern_return_t;
        }

        #[allow(deprecated)]
        let host = unsafe { libc::mach_host_self() };
        let mut stats = unsafe { std::mem::zeroed::<libc::vm_statistics64_data_t>() };
        let mut count = libc::HOST_VM_INFO64_COUNT;
        #[allow(deprecated)]
        let result = unsafe {
            libc::host_statistics64(
                host,
                libc::HOST_VM_INFO64,
                &mut stats as *mut _ as *mut libc::integer_t,
                &mut count,
            )
        };
        #[allow(deprecated)]
        let deallocate_result = unsafe { mach_port_deallocate(libc::mach_task_self(), host) };

        if result != libc::KERN_SUCCESS {
            return Err(format!("host_statistics64 failed with code {result}"));
        }
        if deallocate_result != libc::KERN_SUCCESS {
            return Err(format!(
                "mach_port_deallocate failed with code {deallocate_result}"
            ));
        }

        let page_size = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
        if page_size <= 0 {
            return Err("Failed to determine the system page size".into());
        }

        let available_pages = u64::from(stats.free_count)
            + u64::from(stats.inactive_count)
            + u64::from(stats.speculative_count);
        return Ok(Some(available_pages * page_size as u64));
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Ok(None)
    }
}

#[tauri::command]
fn set_speed(speed: f64, state: State<AppState>) -> Result<f64, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.set_speed(speed);
        Ok(playlist.speed())
    } else {
        Err("No file loaded".into())
    }
}

#[tauri::command]
fn get_speed(state: State<AppState>) -> Result<f64, String> {
    let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref playlist) = *engine_guard {
        Ok(playlist.speed())
    } else {
        Ok(1.0)
    }
}

#[tauri::command]
fn set_loop(enabled: bool, state: State<AppState>) -> Result<bool, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.set_loop(enabled);
        Ok(playlist.loop_enabled())
    } else {
        Err("No file loaded".into())
    }
}

#[tauri::command]
fn get_loop(state: State<AppState>) -> Result<bool, String> {
    let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref playlist) = *engine_guard {
        Ok(playlist.loop_enabled())
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn step_forward(state: State<AppState>) -> Result<Option<FrameInfo>, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        match playlist.step_forward().map_err(|e| e.to_string())? {
            Some(frame) => Ok(Some(frame_to_info(&frame))),
            None => Ok(None),
        }
    } else {
        Err("No file loaded".into())
    }
}

#[tauri::command]
fn step_back(state: State<AppState>) -> Result<Option<FrameInfo>, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        match playlist.step_back().map_err(|e| e.to_string())? {
            Some(frame) => Ok(Some(frame_to_info(&frame))),
            None => Ok(None),
        }
    } else {
        Err("No file loaded".into())
    }
}

#[tauri::command]
fn playlist_add(
    app: tauri::AppHandle,
    path: String,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let path_buf = PathBuf::from(&path);
    let reader = open_indexed_asc(&app, &path_buf)?;

    // 解析为规范绝对路径（消除 ..、符号链接等），失败则退化为原路径
    let canonical_path = std::fs::canonicalize(&path_buf).unwrap_or_else(|_| path_buf.clone());
    let file_name = canonical_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let engine = PlaybackEngine::new(reader);

    let entry = PlaylistEntry {
        engine,
        file_name,
        file_path: canonical_path.to_string_lossy().to_string(),
        enabled: true,
        global_start_offset: 0.0,
        global_end_offset: None,
        play_start_offset: 0.0,
        play_end_offset: None,
    };

    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        // 检查重复：双方都规范化为绝对路径后比较，避免不同路径指向同一文件
        if playlist.entries().iter().any(|e| {
            let existing = PathBuf::from(&e.file_path);
            let existing_canonical = std::fs::canonicalize(&existing).unwrap_or(existing);
            existing_canonical == canonical_path
        }) {
            return Err(format!("文件已存在：{}", path));
        }
        let was_playing = playlist.state() == PlaybackState::Playing;
        playlist.add_entry(entry);
        if was_playing {
            playlist.play().map_err(|e| e.to_string())?;
        }
        Ok(build_playlist_info(playlist))
    } else {
        let mut playlist = PlaylistEngine::new();
        playlist.add_entry(entry);
        let info = build_playlist_info(&playlist);

        let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
        *file_path = Some(canonical_path);

        *engine_guard = Some(playlist);
        Ok(info)
    }
}

fn find_asc_files(folder: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let mut dirs: Vec<PathBuf> = vec![folder.to_path_buf()];

    while let Some(dir) = dirs.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    dirs.push(path);
                } else if let Some(ext) = path.extension() {
                    if ext.eq_ignore_ascii_case("asc") {
                        result.push(path);
                    }
                }
            }
        }
    }

    result.sort();
    result
}

fn build_entry_from_path(
    path: &PathBuf,
    app: &tauri::AppHandle,
) -> Result<PlaylistEntry<AscReader>, String> {
    let reader = open_indexed_asc(app, path)?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let engine = PlaybackEngine::new(reader);
    Ok(PlaylistEntry {
        engine,
        file_name,
        file_path: path.to_string_lossy().to_string(),
        enabled: true,
        global_start_offset: 0.0,
        global_end_offset: None,
        play_start_offset: 0.0,
        play_end_offset: None,
    })
}

#[tauri::command]
fn playlist_add_folder(
    app: tauri::AppHandle,
    folder_path: String,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let folder = PathBuf::from(&folder_path);
    if !folder.is_dir() {
        return Err(format!("不是文件夹: {}", folder_path));
    }

    let asc_paths = find_asc_files(&folder);
    if asc_paths.is_empty() {
        return Err(format!("文件夹中未找到 .asc 文件: {}", folder_path));
    }

    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut playlist) = *engine_guard {
        let was_playing = playlist.state() == PlaybackState::Playing;
        let mut added = 0usize;

        for path in &asc_paths {
            match build_entry_from_path(path, &app) {
                Ok(entry) => {
                    playlist.add_entry(entry);
                    added += 1;
                }
                Err(error) => {
                    eprintln!("跳过无法解析的文件 {}: {}", path.display(), error);
                }
            }
        }

        if added == 0 {
            return Err("文件夹中没有可解析的 .asc 文件".into());
        }

        if was_playing {
            playlist.play().map_err(|e| e.to_string())?;
        }
        Ok(build_playlist_info(playlist))
    } else {
        let mut playlist = PlaylistEngine::new();
        let mut first_added: Option<PathBuf> = None;
        let mut added = 0usize;

        for path in &asc_paths {
            match build_entry_from_path(path, &app) {
                Ok(entry) => {
                    if first_added.is_none() {
                        first_added = Some(path.clone());
                    }
                    playlist.add_entry(entry);
                    added += 1;
                }
                Err(error) => {
                    eprintln!("跳过无法解析的文件 {}: {}", path.display(), error);
                }
            }
        }

        if added == 0 {
            return Err("文件夹中没有可解析的 .asc 文件".into());
        }

        let info = build_playlist_info(&playlist);

        if let Some(fp) = first_added {
            let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
            *file_path = Some(fp);
        }

        *engine_guard = Some(playlist);
        Ok(info)
    }
}

#[tauri::command]
fn playlist_remove(
    app: tauri::AppHandle,
    index: usize,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        let was_playing = playlist.state() == PlaybackState::Playing;
        playlist.remove_entry(index).map_err(|e| e.to_string())?;
        if was_playing && playlist.state() == PlaybackState::Stopped {
            app.emit("playback-state-changed", "stopped")
                .map_err(|e| format!("Failed to notify playback state change: {e}"))?;
        }
        Ok(build_playlist_info(playlist))
    } else {
        Err("No playlist active".into())
    }
}

#[tauri::command]
fn playlist_clear(state: State<AppState>) -> Result<PlaylistInfo, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.clear();
        Ok(build_playlist_info(playlist))
    } else {
        Ok(PlaylistInfo {
            files: Vec::new(),
            total_duration: Some(0.0),
            total_frames: Some(0),
            file_count: 0,
            enabled_count: 0,
        })
    }
}

#[tauri::command]
fn playlist_toggle(
    app: tauri::AppHandle,
    index: usize,
    enabled: bool,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        let was_playing = playlist.state() == PlaybackState::Playing;
        playlist
            .toggle_entry(index, enabled)
            .map_err(|e| e.to_string())?;
        if was_playing && playlist.state() == PlaybackState::Stopped {
            app.emit("playback-state-changed", "stopped")
                .map_err(|e| format!("Failed to notify playback state change: {e}"))?;
        }
        Ok(build_playlist_info(playlist))
    } else {
        Err("No playlist active".into())
    }
}

#[tauri::command]
fn playlist_reorder(
    from: usize,
    to: usize,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.reorder(from, to);
        Ok(build_playlist_info(playlist))
    } else {
        Err("No playlist active".into())
    }
}

#[tauri::command]
fn playlist_set_offset(
    index: usize,
    play_start_offset: f64,
    play_end_offset: Option<f64>,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.set_entry_offsets(index, play_start_offset, play_end_offset);
        Ok(build_playlist_info(playlist))
    } else {
        Err("No playlist active".into())
    }
}

#[tauri::command]
fn playlist_get_files(state: State<AppState>) -> Result<Option<PlaylistInfo>, String> {
    let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(build_playlist_info_from_state(&engine_guard))
}

#[tauri::command]
fn playlist_get_info(state: State<AppState>) -> Result<Option<PlaylistInfo>, String> {
    let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(build_playlist_info_from_state(&engine_guard))
}

fn now_iso() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| {
            let secs = d.as_secs();
            let mut ts = secs;
            let mut buf = [0u8; 20];
            let mut i = 20;
            loop {
                i -= 1;
                buf[i] = b'0' + (ts % 10) as u8;
                ts /= 10;
                if ts == 0 {
                    break;
                }
            }
            let secs_str = std::str::from_utf8(&buf[i..]).unwrap_or("0");
            let datetime = chrono_lite(secs_str);
            datetime
        })
        .unwrap_or_else(|_| "unknown".into())
}

fn chrono_lite(unix_secs: &str) -> String {
    let seconds: i64 = unix_secs.parse().unwrap_or(0);
    let days_since_epoch = seconds / 86400;
    let time_of_day = seconds % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let secs = time_of_day % 60;

    let mut year = 1970;
    let mut remaining_days = days_since_epoch as i32;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let days_in_month = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 0;
    for (i, &dim) in days_in_month.iter().enumerate() {
        if remaining_days < dim {
            month = i + 1;
            break;
        }
        remaining_days -= dim;
    }
    let day = remaining_days + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, secs
    )
}

fn is_leap(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn recent_projects_path(app: &tauri::AppHandle) -> PathBuf {
    let mut dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&dir).ok();
    dir.push("recent_projects.json");
    dir
}

fn load_recent_projects(app: &tauri::AppHandle) -> Vec<RecentProjectEntry> {
    let path = recent_projects_path(app);
    let mut entries: Vec<RecentProjectEntry> = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let original_len = entries.len();
    entries.retain(|e| Path::new(&e.path).exists());
    if entries.len() != original_len {
        save_recent_projects(app, &entries);
    }

    entries
}

fn save_recent_projects(app: &tauri::AppHandle, entries: &[RecentProjectEntry]) {
    let path = recent_projects_path(app);
    if let Ok(json) = serde_json::to_string_pretty(entries) {
        fs::write(&path, json).ok();
    }
}

fn add_to_recent(app: &tauri::AppHandle, name: &str, path: &str) {
    let mut entries = load_recent_projects(app);
    entries.retain(|e| e.path != path);
    entries.insert(
        0,
        RecentProjectEntry {
            name: name.to_string(),
            path: path.to_string(),
            opened_at: now_iso(),
        },
    );
    entries.truncate(MAX_RECENT_PROJECTS);
    save_recent_projects(app, &entries);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInfo {
    name: String,
    can_log_path: Option<String>,
    dbc_bindings: Vec<DbcBinding>,
    last_position: f64,
    filters: FilterConfigJson,
    chart_signals: Vec<ChartSignalJson>,
    ui_layout: UiLayoutJson,
    created_at: String,
    modified_at: String,
    project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentProjectInfo {
    name: String,
    path: String,
    opened_at: String,
}

impl From<&RecentProjectEntry> for RecentProjectInfo {
    fn from(e: &RecentProjectEntry) -> Self {
        Self {
            name: e.name.clone(),
            path: e.path.clone(),
            opened_at: e.opened_at.clone(),
        }
    }
}

#[tauri::command]
fn create_project(
    _app: tauri::AppHandle,
    name: String,
    state: State<AppState>,
) -> Result<ProjectInfo, String> {
    let now = now_iso();
    let project = ProjectConfig {
        name,
        can_log_path: None,
        dbc_bindings: Vec::new(),
        last_position: 0.0,
        filters: FilterConfigJson::default(),
        chart_signals: Vec::new(),
        ui_layout: UiLayoutJson::default(),
        created_at: now.clone(),
        modified_at: now,
    };

    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    let mut dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    let mut file_path_guard = state.file_path.lock().map_err(|e| e.to_string())?;
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    let mut project_path = state.project_path.lock().map_err(|e| e.to_string())?;
    let mut dirty_guard = state.dirty.lock().map_err(|e| e.to_string())?;

    *engine_guard = None;
    dbc_map.clear();
    *file_path_guard = None;
    *project_guard = Some(project.clone());
    *project_path = None;
    *dirty_guard = false;
    drop(engine_guard);
    drop(dbc_map);
    drop(file_path_guard);
    drop(project_guard);
    drop(project_path);
    drop(dirty_guard);

    Ok(ProjectInfo {
        name: project.name,
        can_log_path: project.can_log_path,
        dbc_bindings: project.dbc_bindings,
        last_position: project.last_position,
        filters: project.filters,
        chart_signals: project.chart_signals,
        ui_layout: project.ui_layout,
        created_at: project.created_at,
        modified_at: project.modified_at,
        project_path: None,
    })
}

#[tauri::command]
fn create_project_as(
    app: tauri::AppHandle,
    name: String,
    path: String,
    panels: Vec<PanelLayoutJson>,
    state: State<AppState>,
) -> Result<ProjectInfo, String> {
    let now = now_iso();
    let project = ProjectConfig {
        name,
        can_log_path: None,
        dbc_bindings: Vec::new(),
        last_position: 0.0,
        filters: FilterConfigJson::default(),
        chart_signals: Vec::new(),
        ui_layout: UiLayoutJson {
            panels,
            ..UiLayoutJson::default()
        },
        created_at: now.clone(),
        modified_at: now,
    };
    let save_path = PathBuf::from(&path);
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    let mut dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    let mut file_path_guard = state.file_path.lock().map_err(|e| e.to_string())?;
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    let mut project_path_guard = state.project_path.lock().map_err(|e| e.to_string())?;
    let mut dirty_guard = state.dirty.lock().map_err(|e| e.to_string())?;

    if let Some(parent) = save_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&save_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                format!("Project file already exists: {}", path)
            } else {
                e.to_string()
            }
        })?;
    if let Err(write_error) = file.write_all(json.as_bytes()) {
        drop(file);
        return match fs::remove_file(&save_path) {
            Ok(()) => Err(format!("Failed to write project file: {}", write_error)),
            Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => {
                Err(format!("Failed to write project file: {}", write_error))
            }
            Err(cleanup_error) => Err(format!(
                "Failed to write project file: {}; failed to remove incomplete file: {}",
                write_error, cleanup_error
            )),
        };
    }

    *engine_guard = None;
    dbc_map.clear();
    *file_path_guard = None;
    *project_guard = Some(project.clone());
    *project_path_guard = Some(save_path);
    *dirty_guard = false;
    drop(engine_guard);
    drop(dbc_map);
    drop(file_path_guard);
    drop(project_guard);
    drop(project_path_guard);
    drop(dirty_guard);

    add_to_recent(&app, &project.name, &path);

    Ok(ProjectInfo {
        name: project.name,
        can_log_path: project.can_log_path,
        dbc_bindings: project.dbc_bindings,
        last_position: project.last_position,
        filters: project.filters,
        chart_signals: project.chart_signals,
        ui_layout: project.ui_layout,
        created_at: project.created_at,
        modified_at: project.modified_at,
        project_path: Some(path),
    })
}

#[tauri::command]
fn save_project(app: tauri::AppHandle, state: State<AppState>) -> Result<String, String> {
    let project_guard = state.project.lock().map_err(|e| e.to_string())?;
    let project = project_guard
        .clone()
        .ok_or_else(|| "No active project".to_string())?;

    let project_path_guard = state.project_path.lock().map_err(|e| e.to_string())?;
    let save_path = match &*project_path_guard {
        Some(p) => p.clone(),
        None => {
            return Err("Project has no file path yet. Use 'Save As' instead.".to_string());
        }
    };

    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(&save_path, json).map_err(|e| e.to_string())?;

    add_to_recent(&app, &project.name, &save_path.to_string_lossy());

    if let Ok(mut dirty) = state.dirty.lock() {
        *dirty = false;
    }

    Ok(save_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_project_as(
    app: tauri::AppHandle,
    path: String,
    state: State<AppState>,
) -> Result<String, String> {
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    let mut project = project_guard
        .clone()
        .ok_or_else(|| "No active project".to_string())?;

    let now = now_iso();
    project.modified_at = now;
    *project_guard = Some(project.clone());

    let save_path = PathBuf::from(&path);
    if let Some(parent) = save_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(&save_path, json).map_err(|e| e.to_string())?;

    let mut project_path_guard = state.project_path.lock().map_err(|e| e.to_string())?;
    *project_path_guard = Some(save_path.clone());

    add_to_recent(&app, &project.name, &path);

    if let Ok(mut dirty) = state.dirty.lock() {
        *dirty = false;
    }

    Ok(path)
}

#[tauri::command]
fn open_project(
    app: tauri::AppHandle,
    path: String,
    state: State<AppState>,
) -> Result<ProjectInfo, String> {
    let project_path = PathBuf::from(&path);
    let json = fs::read_to_string(&project_path)
        .map_err(|e| format!("Failed to read project file: {}", e))?;
    let mut project: ProjectConfig =
        serde_json::from_str(&json).map_err(|e| format!("Invalid project file: {}", e))?;

    let mut next_engine = None;
    let mut next_file_path = None;

    if let Some(ref can_log_path) = project.can_log_path {
        let log_path = PathBuf::from(can_log_path);
        if !log_path.exists() {
            return Err(format!(
                "CAN log file not found: {}\nThe file may have been moved or deleted.",
                can_log_path
            ));
        }

        let reader = open_indexed_asc(&app, &log_path)?;

        let entry = PlaylistEntry {
            engine: PlaybackEngine::new(reader),
            file_name: log_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            file_path: can_log_path.clone(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        };

        let mut playlist = PlaylistEngine::new();
        playlist.add_entry(entry);
        if project.last_position > 0.0 {
            let _ = playlist.seek_to(project.last_position);
        }

        next_engine = Some(playlist);
        next_file_path = Some(log_path);
    }

    let mut next_dbc_map = HashMap::new();
    for binding in &project.dbc_bindings {
        let dbc_path = PathBuf::from(&binding.path);
        if dbc_path.exists() {
            if let Ok(dbc) = canscope_dbc::parse_dbc(&dbc_path) {
                next_dbc_map.insert(binding.bus_id, dbc);
            }
        }
    }

    let now = now_iso();
    project.modified_at = now;
    let project_clone = project.clone();

    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    let mut dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    let mut project_path_guard = state.project_path.lock().map_err(|e| e.to_string())?;
    let mut dirty_guard = state.dirty.lock().map_err(|e| e.to_string())?;

    *engine_guard = next_engine;
    *dbc_map = next_dbc_map;
    *file_path = next_file_path;
    *project_guard = Some(project);
    *project_path_guard = Some(project_path.clone());
    *dirty_guard = false;
    drop(engine_guard);
    drop(dbc_map);
    drop(file_path);
    drop(project_guard);
    drop(project_path_guard);
    drop(dirty_guard);

    add_to_recent(&app, &project_clone.name, &path);

    Ok(ProjectInfo {
        name: project_clone.name,
        can_log_path: project_clone.can_log_path,
        dbc_bindings: project_clone.dbc_bindings,
        last_position: project_clone.last_position,
        filters: project_clone.filters,
        chart_signals: project_clone.chart_signals,
        ui_layout: project_clone.ui_layout,
        created_at: project_clone.created_at,
        modified_at: project_clone.modified_at,
        project_path: Some(path),
    })
}

#[tauri::command]
fn get_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProjectInfo>, String> {
    let entries = load_recent_projects(&app);
    Ok(entries.iter().map(RecentProjectInfo::from).collect())
}

#[tauri::command]
fn remove_recent_project(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut entries = load_recent_projects(&app);
    entries.retain(|e| e.path != path);
    save_recent_projects(&app, &entries);
    Ok(())
}

#[tauri::command]
fn clear_recent_projects(app: tauri::AppHandle) -> Result<(), String> {
    save_recent_projects(&app, &[]);
    Ok(())
}

#[tauri::command]
fn update_project_state(
    state: State<AppState>,
    filters: Option<FilterConfigJson>,
    chart_signals: Option<Vec<ChartSignalJson>>,
    ui_layout: Option<UiLayoutJson>,
    last_position: Option<f64>,
) -> Result<(), String> {
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut project) = *project_guard {
        if let Some(f) = filters {
            project.filters = f;
        }
        if let Some(c) = chart_signals {
            project.chart_signals = c;
        }
        if let Some(u) = ui_layout {
            project.ui_layout = u;
        }
        if let Some(p) = last_position {
            project.last_position = p;
        }
        project.modified_at = now_iso();
    }
    if let Ok(mut dirty) = state.dirty.lock() {
        *dirty = true;
    }
    Ok(())
}

#[tauri::command]
fn set_project_can_log(can_log_path: String, state: State<AppState>) -> Result<(), String> {
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut project) = *project_guard {
        project.can_log_path = Some(can_log_path);
        project.modified_at = now_iso();
    }
    if let Ok(mut dirty) = state.dirty.lock() {
        *dirty = true;
    }
    Ok(())
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
fn append_runtime_log_file(
    state: State<AppState>,
    path: String,
    entry: serde_json::Value,
) -> Result<(), String> {
    let _guard = state
        .runtime_log_write_lock
        .lock()
        .map_err(|e| e.to_string())?;
    let path = Path::new(&path);
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create log directory: {e}"))?;
    }
    let line =
        serde_json::to_string(&entry).map_err(|e| format!("Failed to serialize log: {e}"))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open log file: {e}"))?;
    writeln!(file, "{line}").map_err(|e| format!("Failed to write log file: {e}"))
}

#[tauri::command]
fn reveal_runtime_log_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.as_os_str().is_empty() {
        return Err("Log file path is empty".to_string());
    }
    let reveal_target = if path.exists() {
        path.clone()
    } else {
        path.parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .map(Path::to_path_buf)
            .ok_or_else(|| "Log file directory does not exist".to_string())?
    };

    #[cfg(target_os = "windows")]
    let result = if path.exists() {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", reveal_target.display()))
            .spawn()
    } else {
        std::process::Command::new("explorer.exe")
            .arg(&reveal_target)
            .spawn()
    };
    #[cfg(target_os = "macos")]
    let result = if path.exists() {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&reveal_target)
            .spawn()
    } else {
        std::process::Command::new("open")
            .arg(&reveal_target)
            .spawn()
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open")
        .arg(reveal_target)
        .spawn();

    result
        .map(|_| ())
        .map_err(|e| format!("Failed to open log file location: {e}"))
}

#[tauri::command]
fn is_project_dirty(state: State<AppState>) -> Result<bool, String> {
    let dirty = state.dirty.lock().map_err(|e| e.to_string())?;
    Ok(*dirty)
}

#[tauri::command]
fn close_project(state: State<AppState>) -> Result<(), String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    *engine_guard = None;
    let mut dbc_map = state.dbc_map.lock().map_err(|e| e.to_string())?;
    dbc_map.clear();
    let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
    *file_path = None;
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    *project_guard = None;
    let mut project_path_guard = state.project_path.lock().map_err(|e| e.to_string())?;
    *project_path_guard = None;
    if let Ok(mut dirty) = state.dirty.lock() {
        *dirty = false;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            engine: Mutex::new(None),
            dbc_map: Mutex::new(HashMap::new()),
            runtime_log_write_lock: Mutex::new(()),
            file_path: Mutex::new(None),
            project: Mutex::new(None),
            project_path: Mutex::new(None),
            dirty: Mutex::new(false),
        })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Dark));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reload_all_dbc,
            load_dbc,
            get_dbc_info,
            get_dbc_detail,
            get_batch,
            get_frame_page,
            get_chart_data,
            playback_control,
            get_playback_state,
            seek_to,
            get_progress,
            get_available_memory_bytes,
            set_speed,
            get_speed,
            set_loop,
            get_loop,
            step_forward,
            step_back,
            playlist_add,
            playlist_add_folder,
            playlist_remove,
            playlist_clear,
            playlist_toggle,
            playlist_reorder,
            playlist_set_offset,
            playlist_get_files,
            playlist_get_info,
            create_project,
            create_project_as,
            open_project,
            save_project,
            save_project_as,
            get_recent_projects,
            remove_recent_project,
            clear_recent_projects,
            update_project_state,
            set_project_can_log,
            ensure_dir,
            append_runtime_log_file,
            reveal_runtime_log_file,
            is_project_dirty,
            close_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CanScope");
}

#[cfg(test)]
mod tests {
    use super::{
        format_frame_time, get_available_memory_bytes, matches_frame_table_filter,
        FrameTableFilter, UiLayoutJson,
    };
    use canscope_core::CanFrame;

    #[test]
    fn legacy_ui_layout_defaults_panel_layouts() {
        let layout: UiLayoutJson =
            serde_json::from_str(r#"{"panelWidth":260,"chartHeight":200}"#).unwrap();
        assert!(layout.panels.is_empty());
    }

    #[test]
    fn frame_table_filter_matches_fields_across_pages() {
        let mut data = [0; 64];
        data[..2].copy_from_slice(&[0xAA, 0xBB]);
        let frame = CanFrame {
            timestamp: 5.0,
            bus_id: 0,
            can_id: 0x123,
            is_extended: false,
            is_remote: false,
            is_fd: true,
            is_brs: true,
            is_error: false,
            is_tx: false,
            dlc: 2,
            data,
        };
        let filter = FrameTableFilter {
            can_id: "0x12".to_string(),
            channel: "CAN 1".to_string(),
            frame_type: "CAN FD(加速)".to_string(),
            data: "aa bb".to_string(),
            name: "speed".to_string(),
            ..FrameTableFilter::default()
        };

        assert!(matches_frame_table_filter(
            &frame,
            Some("VehicleSpeed"),
            5.0,
            Some(4.99),
            0.0,
            &filter,
        ));
    }

    #[test]
    fn frame_table_filter_matches_direction() {
        let frame = CanFrame {
            timestamp: 0.0,
            bus_id: 0,
            can_id: 0x123,
            is_extended: false,
            is_remote: false,
            is_fd: false,
            is_brs: false,
            is_error: false,
            is_tx: true,
            dlc: 0,
            data: [0; 64],
        };
        let tx_filter = FrameTableFilter {
            direction: "TX".to_string(),
            ..FrameTableFilter::default()
        };
        let rx_filter = FrameTableFilter {
            direction: "RX".to_string(),
            ..FrameTableFilter::default()
        };

        assert!(matches_frame_table_filter(
            &frame, None, 0.0, None, 0.0, &tx_filter,
        ));
        assert!(!matches_frame_table_filter(
            &frame, None, 0.0, None, 0.0, &rx_filter,
        ));
    }

    #[test]
    fn frame_table_filter_formats_relative_time_from_trace_origin() {
        let filter = FrameTableFilter {
            time_format: "relative-to-start".to_string(),
            ..FrameTableFilter::default()
        };
        assert_eq!(format_frame_time(12.5, None, 10.0, &filter), "2.500000");
    }

    #[cfg(any(windows, target_os = "macos"))]
    #[test]
    fn reports_available_system_memory() {
        assert!(get_available_memory_bytes().unwrap().unwrap() > 0);
    }
}
