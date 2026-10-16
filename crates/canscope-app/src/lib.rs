use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use canscope_dbc::{Dbc, DecodedSignal, DbcMessage, DbcSignal};
use canscope_parser::asc::AscReader;
use canscope_playback::{PlaybackEngine, PlaybackFrame, PlaybackState, PlaylistEngine, PlaylistEntry};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

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
}

impl Default for UiLayoutJson {
    fn default() -> Self {
        Self {
            panel_width: 260.0,
            chart_height: 200.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectConfig {
    name: String,
    can_log_path: Option<String>,
    dbc_paths: Vec<String>,
    last_position: f64,
    filters: FilterConfigJson,
    chart_signals: Vec<ChartSignalJson>,
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
    dbc: Mutex<Option<Dbc>>,
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
    is_tx: bool,
    dlc: u8,
    #[serde(with = "serde_bytes")]
    data: [u8; 64],
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
    bus_count: u8,
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
            bus_count: e.engine.metadata().bus_count,
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
    FrameInfo {
        timestamp: f.timestamp,
        bus_id: f.bus_id,
        can_id: f.can_id,
        is_extended: f.is_extended,
        is_fd: f.is_fd,
        is_tx: f.is_tx,
        dlc: f.dlc,
        data: *f.data,
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
    let dbc_guard = state.dbc.lock().map_err(|e| e.to_string())?;
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut playlist) = *engine_guard {
        if let Some(ref dbc) = *dbc_guard {
            playlist.set_dbc(dbc.clone());
        }
        let batch = playlist.next_batch(100).map_err(|e| e.to_string())?;
        Ok(batch.iter().map(frame_to_info).collect())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn playback_control(
    action: String,
    state: State<AppState>,
) -> Result<String, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut playlist) = *engine_guard {
        match action.as_str() {
            "play" => {
                playlist.play();
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
fn seek_to(
    timestamp: f64,
    state: State<AppState>,
) -> Result<(), String> {
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
fn set_speed(
    speed: f64,
    state: State<AppState>,
) -> Result<f64, String> {
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
fn set_loop(
    enabled: bool,
    state: State<AppState>,
) -> Result<bool, String> {
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
    path: String,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let path_buf = PathBuf::from(&path);
    let reader = AscReader::open(&path_buf).map_err(|e| e.to_string())?;

    let file_name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let engine = PlaybackEngine::new(reader);

    let entry = PlaylistEntry {
        engine,
        file_name,
        file_path: path.clone(),
        enabled: true,
        global_start_offset: 0.0,
        global_end_offset: None,
    };

    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        let was_playing = playlist.state() == PlaybackState::Playing;
        playlist.add_entry(entry);
        if was_playing {
            playlist.play();
        }
        Ok(build_playlist_info(playlist))
    } else {
        // Create new playlist with single file
        let mut playlist = PlaylistEngine::new();
        playlist.add_entry(entry);
        let info = build_playlist_info(&playlist);

        let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
        *file_path = Some(path_buf);

        *engine_guard = Some(playlist);
        Ok(info)
    }
}

#[tauri::command]
fn playlist_remove(
    index: usize,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.remove_entry(index);
        Ok(build_playlist_info(playlist))
    } else {
        Err("No playlist active".into())
    }
}

#[tauri::command]
fn playlist_toggle(
    index: usize,
    enabled: bool,
    state: State<AppState>,
) -> Result<PlaylistInfo, String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut playlist) = *engine_guard {
        playlist.toggle_entry(index, enabled);
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
    dbc_paths: Vec<String>,
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
        dbc_paths: Vec::new(),
        last_position: 0.0,
        filters: FilterConfigJson::default(),
        chart_signals: Vec::new(),
        ui_layout: UiLayoutJson::default(),
        created_at: now.clone(),
        modified_at: now,
    };

    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    *project_guard = Some(project.clone());

    let mut project_path = state.project_path.lock().map_err(|e| e.to_string())?;
    *project_path = None;

    if let Ok(mut dirty) = state.dirty.lock() {
        *dirty = false;
    }

    Ok(ProjectInfo {
        name: project.name,
        can_log_path: project.can_log_path,
        dbc_paths: project.dbc_paths,
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
fn save_project(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<String, String> {
    let project_guard = state.project.lock().map_err(|e| e.to_string())?;
    let project = project_guard
        .clone()
        .ok_or_else(|| "No active project".to_string())?;

    let project_path_guard = state.project_path.lock().map_err(|e| e.to_string())?;
    let save_path = match &*project_path_guard {
        Some(p) => p.clone(),
        None => {
            return Err(
                "Project has no file path yet. Use 'Save As' instead.".to_string(),
            );
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
    let json = fs::read_to_string(&project_path).map_err(|e| {
        format!("Failed to read project file: {}", e)
    })?;
    let mut project: ProjectConfig =
        serde_json::from_str(&json).map_err(|e| format!("Invalid project file: {}", e))?;

    if let Some(ref can_log_path) = project.can_log_path {
        let log_path = PathBuf::from(can_log_path);
        if !log_path.exists() {
            return Err(format!(
                "CAN log file not found: {}\nThe file may have been moved or deleted.",
                can_log_path
            ));
        }

        let reader = AscReader::open(&log_path).map_err(|e| e.to_string())?;

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
        };

        let mut playlist = PlaylistEngine::new();
        playlist.add_entry(entry);
        if project.last_position > 0.0 {
            let _ = playlist.seek_to(project.last_position);
        }

        let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
        *engine_guard = Some(playlist);

        let mut file_path = state.file_path.lock().map_err(|e| e.to_string())?;
        *file_path = Some(log_path);
    }

    let mut dbc_guard = state.dbc.lock().map_err(|e| e.to_string())?;
    *dbc_guard = None;

    for dbc_path_str in &project.dbc_paths {
        let dbc_path = PathBuf::from(dbc_path_str);
        if dbc_path.exists() {
            if let Ok(dbc) = canscope_dbc::parse_dbc(&dbc_path) {
                *dbc_guard = Some(dbc);
                break;
            }
        }
    }

    let now = now_iso();
    project.modified_at = now;
    let project_clone = project.clone();
    let mut project_guard = state.project.lock().map_err(|e| e.to_string())?;
    *project_guard = Some(project);

    let mut project_path_guard = state.project_path.lock().map_err(|e| e.to_string())?;
    *project_path_guard = Some(project_path.clone());

    add_to_recent(&app, &project_clone.name, &path);

    if let Ok(mut dirty) = state.dirty.lock() {
        *dirty = false;
    }

    Ok(ProjectInfo {
        name: project_clone.name,
        can_log_path: project_clone.can_log_path,
        dbc_paths: project_clone.dbc_paths,
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
fn set_project_can_log(
    can_log_path: String,
    state: State<AppState>,
) -> Result<(), String> {
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
fn is_project_dirty(state: State<AppState>) -> Result<bool, String> {
    let dirty = state.dirty.lock().map_err(|e| e.to_string())?;
    Ok(*dirty)
}

#[tauri::command]
fn close_project(state: State<AppState>) -> Result<(), String> {
    let mut engine_guard = state.engine.lock().map_err(|e| e.to_string())?;
    *engine_guard = None;
    let mut dbc_guard = state.dbc.lock().map_err(|e| e.to_string())?;
    *dbc_guard = None;
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
            dbc: Mutex::new(None),
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
            load_dbc,
            get_dbc_info,
            get_batch,
            playback_control,
            get_playback_state,
            seek_to,
            get_progress,
            set_speed,
            get_speed,
            set_loop,
            get_loop,
            step_forward,
            step_back,
            playlist_add,
            playlist_remove,
            playlist_toggle,
            playlist_reorder,
            playlist_get_files,
            playlist_get_info,
            create_project,
            open_project,
            save_project,
            save_project_as,
            get_recent_projects,
            update_project_state,
            set_project_can_log,
            ensure_dir,
            is_project_dirty,
            close_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CanScope");
}