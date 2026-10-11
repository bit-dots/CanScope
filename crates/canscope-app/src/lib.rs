use std::path::PathBuf;
use std::sync::Mutex;

use canscope_core::CanFrameStream;
use canscope_dbc::{Dbc, DecodedSignal, DbcMessage, DbcSignal};
use canscope_parser::asc::AscReader;
use canscope_playback::{PlaybackEngine, PlaybackFrame, PlaybackState};
use serde::{Deserialize, Serialize};
use tauri::State;

struct AppState {
    engine: Mutex<Option<PlaybackEngine<AscReader>>>,
    dbc: Mutex<Option<Dbc>>,
    file_path: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileMetadata {
    file_name: String,
    total_frames: u64,
    duration: Option<f64>,
    bus_count: u8,
    start_time: Option<String>,
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
    can_id: u32,
    name: String,
    dlc: u8,
    sender: String,
    signals: Vec<DbcSignalInfo>,
    signal_count: usize,
}

impl From<&DbcMessage> for DbcMessageInfo {
    fn from(m: &DbcMessage) -> Self {
        Self {
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
    let dbc_guard = state.dbc.lock().map_err(|e| e.to_string())?;
    if let Some(ref dbc) = *dbc_guard {
        let messages: Vec<DbcMessageInfo> = dbc.messages.iter().map(|m| DbcMessageInfo::from(m)).collect();
        let signal_count: usize = messages.iter().map(|m| m.signal_count).sum();
        Ok(Some(DbcTreeInfo {
            message_count: messages.len(),
            signal_count,
            messages,
        }))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize)]
struct FrameInfo {
    timestamp: f64,
    bus_id: u8,
    can_id: u32,
    is_extended: bool,
    is_fd: bool,
    dlc: u8,
    #[serde(with = "serde_bytes")]
    data: [u8; 64],
    signals: Option<Vec<DecodedSignalInfo>>,
}

#[derive(Debug, Clone, Serialize)]
struct OpenResult {
    metadata: FileMetadata,
    frames: Vec<FrameInfo>,
}

#[tauri::command]
fn open_file(
    path: String,
    state: State<AppState>,
) -> Result<OpenResult, String> {
    let path_buf = PathBuf::from(&path);
    let reader = AscReader::open(&path_buf).map_err(|e| e.to_string())?;

    let meta = reader.metadata();
    let total = meta.total_frames.unwrap_or(0);

    let file_name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let metadata = FileMetadata {
        file_name,
        total_frames: total,
        duration: meta.duration,
        bus_count: meta.bus_count,
        start_time: meta.start_time.clone(),
    };

    let engine = PlaybackEngine::new(reader);

    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    *engine_guard = Some(engine);

    let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
    *file_path = Some(path_buf);

    drop(file_path);

    let mut frames = Vec::new();

    if let Some(ref mut engine) = *engine_guard {
        let batch_size = total.min(500) as usize;
        let batch = engine.next_batch(batch_size).map_err(|e| e.to_string())?;
        for f in &batch {
            frames.push(frame_to_info(f));
        }
        let _ = engine.seek_to(0.0);
    }

    drop(engine_guard);

    Ok(OpenResult { metadata, frames })
}

fn frame_to_info(f: &PlaybackFrame) -> FrameInfo {
    FrameInfo {
        timestamp: f.timestamp,
        bus_id: f.bus_id,
        can_id: f.can_id,
        is_extended: f.is_extended,
        is_fd: f.is_fd,
        dlc: f.dlc,
        data: f.data,
        signals: f.signals.as_ref().map(|sigs| sigs.iter().map(DecodedSignalInfo::from).collect()),
    }
}

#[tauri::command]
fn load_dbc(
    path: String,
    state: State<AppState>,
) -> Result<String, String> {
    let dbc = canscope_dbc::parse_dbc(&PathBuf::from(&path)).map_err(|e| e.to_string())?;
    let msg_count = dbc.messages.len();
    let signal_count: usize = dbc.messages.iter().map(|m| m.signals.len()).sum();

    let mut dbc_guard = state.dbc.lock().map_err(|e| e.to_string())?;
    *dbc_guard = Some(dbc);

    Ok(format!("Loaded DBC: {} messages, {} signals", msg_count, signal_count))
}

#[tauri::command]
fn get_batch(state: State<AppState>) -> Result<Vec<FrameInfo>, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    let dbc_guard = state.dbc.lock().map_err(|e| e.to_string())?;

    let mut frames = Vec::new();

    if let Some(ref mut engine) = *engine_guard {
        if let Some(ref dbc) = *dbc_guard {
            engine.set_dbc(dbc.clone());
        }

        let batch = engine.next_batch(100).map_err(|e| e.to_string())?;
        for f in &batch {
            frames.push(frame_to_info(f));
        }
    }

    Ok(frames)
}

#[tauri::command]
fn playback_control(
    action: String,
    state: State<AppState>,
) -> Result<String, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut engine) = *engine_guard {
        match action.as_str() {
            "play" => {
                engine.play();
                Ok("playing".into())
            }
            "pause" => {
                engine.pause();
                Ok("paused".into())
            }
            "stop" => {
                engine.stop();
                let _ = engine.seek_to(0.0);
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
    if let Some(ref engine) = *engine_guard {
        match engine.state() {
            PlaybackState::Stopped => Ok("stopped".into()),
            PlaybackState::Playing => Ok("playing".into()),
            PlaybackState::Paused => Ok("paused".into()),
        }
    } else {
        Ok("stopped".into())
    }
}

#[tauri::command]
fn seek_to(
    timestamp: f64,
    state: State<AppState>,
) -> Result<(), String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut engine) = *engine_guard {
        engine.seek_to(timestamp).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_progress(state: State<AppState>) -> Result<Option<f64>, String> {
    let engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref engine) = *engine_guard {
        Ok(engine.progress())
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            engine: Mutex::new(None),
            dbc: Mutex::new(None),
            file_path: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            load_dbc,
            get_dbc_info,
            get_batch,
            playback_control,
            get_playback_state,
            seek_to,
            get_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CanScope");
}