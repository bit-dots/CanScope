use std::path::PathBuf;
use std::sync::Mutex;

use canscope_core::CanFrameStream;
use canscope_dbc::Dbc;
use canscope_parser::asc::AscReader;
use canscope_playback::{PlaybackEngine, PlaybackFrame, PlaybackState};
use serde::Serialize;
use tauri::State;

struct AppState {
    engine: Mutex<Option<PlaybackEngine<AscReader>>>,
    dbc: Mutex<Option<Dbc>>,
    file_path: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize)]
struct FrameInfo {
    timestamp: f64,
    bus_id: u8,
    can_id: u32,
    is_extended: bool,
    is_fd: bool,
    dlc: u8,
    signal_count: usize,
}

#[tauri::command]
fn open_file(
    path: String,
    state: State<AppState>,
) -> Result<Vec<FrameInfo>, String> {
    let path_buf = PathBuf::from(&path);
    let reader = AscReader::open(&path_buf).map_err(|e| e.to_string())?;

    let total = reader.metadata().total_frames.unwrap_or(0);
    let mut frames = Vec::with_capacity(total.min(500) as usize);

    let engine = PlaybackEngine::new(reader);
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    *engine_guard = Some(engine);

    let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
    *file_path = Some(path_buf);

    drop(engine_guard);
    drop(file_path);

    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut engine) = *engine_guard {
        engine.play();
        let batch = engine.next_batch(500).map_err(|e| e.to_string())?;
        for f in &batch {
            frames.push(FrameInfo {
                timestamp: f.timestamp,
                bus_id: f.bus_id,
                can_id: f.can_id,
                is_extended: f.is_extended,
                is_fd: f.is_fd,
                dlc: f.dlc,
                signal_count: f.signals.as_ref().map(|s| s.len()).unwrap_or(0),
            });
        }
    }

    Ok(frames)
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
            frames.push(FrameInfo {
                timestamp: f.timestamp,
                bus_id: f.bus_id,
                can_id: f.can_id,
                is_extended: f.is_extended,
                is_fd: f.is_fd,
                dlc: f.dlc,
                signal_count: f.signals.as_ref().map(|s| s.len()).unwrap_or(0),
            });
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
                Ok("stopped".into())
            }
            _ => Err(format!("Unknown action: {}", action)),
        }
    } else {
        Err("No file loaded".into())
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
            get_batch,
            playback_control,
            seek_to,
            get_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CanScope");
}