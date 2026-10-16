use canscope_core::CanFrameStream;
use canscope_dbc::Dbc;

use crate::engine::{PlaybackEngine, PlaybackFrame, PlaybackState};
use crate::error::PlaybackError;

/// 播放列表中的一个文件条目
pub struct PlaylistEntry<S: CanFrameStream> {
    pub engine: PlaybackEngine<S>,
    pub file_name: String,
    pub file_path: String,
    pub enabled: bool,
    /// 该文件在全局时间线上的起始偏移（秒）
    pub global_start_offset: f64,
    /// 该文件在全局时间线上的结束偏移（秒），None 表示未知
    pub global_end_offset: Option<f64>,
}

/// 串联播放引擎：按列表顺序首尾相连播放多个 CAN 日志文件
///
/// 文件按原始时间戳自动排序。启用复选框的文件参与串联播放：
/// File1 (0~30min) → File2 (30~45min) → File3 (45~55min)
/// 时间轴无间隙，平滑衔接。
pub struct PlaylistEngine<S: CanFrameStream> {
    entries: Vec<PlaylistEntry<S>>,
    state: PlaybackState,
    speed: f64,
    loop_enabled: bool,
    dbc: Option<Dbc>,
    current_entry_index: usize,
    global_time: Option<f64>,
    global_frame_count: u64,
}

impl<S: CanFrameStream> PlaylistEngine<S> {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            state: PlaybackState::Stopped,
            speed: 1.0,
            loop_enabled: false,
            dbc: None,
            current_entry_index: 0,
            global_time: None,
            global_frame_count: 0,
        }
    }

    pub fn state(&self) -> PlaybackState {
        self.state
    }

    pub fn speed(&self) -> f64 {
        self.speed
    }

    pub fn set_speed(&mut self, speed: f64) {
        self.speed = speed.clamp(0.1, 32.0);
    }

    pub fn set_loop(&mut self, enabled: bool) {
        self.loop_enabled = enabled;
    }

    pub fn loop_enabled(&self) -> bool {
        self.loop_enabled
    }

    pub fn set_dbc(&mut self, dbc: Dbc) {
        self.dbc = Some(dbc);
    }

    pub fn global_time(&self) -> Option<f64> {
        self.global_time
    }

    pub fn global_frame_count(&self) -> u64 {
        self.global_frame_count
    }

    pub fn current_entry_index(&self) -> usize {
        self.current_entry_index
    }

    pub fn entries(&self) -> &[PlaylistEntry<S>] {
        &self.entries
    }

    pub fn entries_mut(&mut self) -> &mut Vec<PlaylistEntry<S>> {
        &mut self.entries
    }

    /// 添加文件到播放列表，自动按 start_time 排序后重新计算全局偏移
    pub fn add_entry(&mut self, entry: PlaylistEntry<S>) {
        self.entries.push(entry);
        self.sort_and_recalc_offsets();
    }

    /// 移除指定索引的文件
    pub fn remove_entry(&mut self, index: usize) {
        if index >= self.entries.len() {
            return;
        }
        self.entries.remove(index);
        if self.current_entry_index >= self.entries.len() {
            self.current_entry_index = self.entries.len().saturating_sub(1);
        }
        self.sort_and_recalc_offsets();
    }

    /// 切换文件的启用/禁用状态
    pub fn toggle_entry(&mut self, index: usize, enabled: bool) {
        if let Some(entry) = self.entries.get_mut(index) {
            entry.enabled = enabled;
        }
    }

    /// 调整文件播放顺序
    pub fn reorder(&mut self, from: usize, to: usize) {
        if from >= self.entries.len() || to >= self.entries.len() || from == to {
            return;
        }
        let entry = self.entries.remove(from);
        self.entries.insert(to, entry);
        if self.current_entry_index == from {
            self.current_entry_index = to;
        } else if from < self.current_entry_index && to >= self.current_entry_index {
            self.current_entry_index = self.current_entry_index.saturating_sub(1);
        } else if from > self.current_entry_index && to <= self.current_entry_index {
            self.current_entry_index += 1;
        }
        self.recalc_offsets();
    }

    /// 按原始时间戳排序并重新计算每个文件的全局时间偏移
    fn sort_and_recalc_offsets(&mut self) {
        self.entries.sort_by(|a, b| {
            let ta = a.engine.metadata().start_time.as_deref().unwrap_or("");
            let tb = b.engine.metadata().start_time.as_deref().unwrap_or("");
            ta.cmp(tb)
        });
        self.recalc_offsets();
    }

    fn recalc_offsets(&mut self) {
        let mut cumulative = 0.0;
        for entry in &mut self.entries {
            entry.global_start_offset = cumulative;
            if let Some(dur) = entry.engine.metadata().duration {
                cumulative += dur;
                entry.global_end_offset = Some(cumulative);
            } else {
                entry.global_end_offset = None;
            }
        }
    }

    /// 获取总时长（所有文件 duration 之和），单位秒
    pub fn total_duration(&self) -> Option<f64> {
        let mut sum = 0.0;
        let mut all_known = true;
        for entry in &self.entries {
            if entry.enabled {
                if let Some(dur) = entry.engine.metadata().duration {
                    sum += dur;
                } else {
                    all_known = false;
                }
            }
        }
        if all_known { Some(sum) } else { None }
    }

    /// 获取所有启用文件的总帧数
    pub fn total_frames(&self) -> Option<u64> {
        let mut sum: u64 = 0;
        let mut all_known = true;
        for entry in &self.entries {
            if entry.enabled {
                if let Some(n) = entry.engine.total_frames() {
                    sum += n;
                } else {
                    all_known = false;
                }
            }
        }
        if all_known { Some(sum) } else { None }
    }

    pub fn play(&mut self) {
        match self.state {
            PlaybackState::Stopped => {
                self.reset_all_entries();
                self.current_entry_index = self.advance_to_next_enabled(0);
                self.state = PlaybackState::Playing;
            }
            PlaybackState::Paused => {
                self.state = PlaybackState::Playing;
            }
            PlaybackState::Playing => {}
        }
    }

    pub fn pause(&mut self) {
        if self.state == PlaybackState::Playing {
            self.state = PlaybackState::Paused;
        }
    }

    pub fn stop(&mut self) {
        self.state = PlaybackState::Stopped;
        self.global_time = None;
        self.global_frame_count = 0;
        self.reset_all_entries();
    }

    fn reset_all_entries(&mut self) {
        let dbc = self.dbc.clone();
        for entry in &mut self.entries {
            entry.engine.stop();
            let _ = entry.engine.seek_to(0.0);
            entry.engine.set_loop(false);
            if let Some(ref dbc) = dbc {
                entry.engine.set_dbc(dbc.clone());
            }
        }
        self.current_entry_index = 0;
    }

    fn advance_to_next_enabled(&self, start_from: usize) -> usize {
        let len = self.entries.len();
        for i in 0..len {
            let idx = (start_from + i) % len;
            if self.entries[idx].enabled {
                return idx;
            }
        }
        start_from
    }

    /// 推进到下一个启用的条目；返回 false 表示没有更多条目可播放
    fn advance_entry(&mut self) -> bool {
        if self.entries.is_empty() {
            return false;
        }
        let start = self.current_entry_index;
        let dbc = self.dbc.clone();
        let len = self.entries.len();

        if self.loop_enabled {
            for i in 1..=len {
                let idx = (start + i) % len;
                if idx == start && i > 1 {
                    return false;
                }
                if self.entries[idx].enabled {
                    let _ = self.entries[idx].engine.seek_to(0.0);
                    self.entries[idx].engine.play();
                    if let Some(ref dbc) = dbc {
                        self.entries[idx].engine.set_dbc(dbc.clone());
                    }
                    self.current_entry_index = idx;
                    return true;
                }
            }
        } else {
            for i in (start + 1)..len {
                if self.entries[i].enabled {
                    self.entries[i].engine.play();
                    if let Some(ref dbc) = dbc {
                        self.entries[i].engine.set_dbc(dbc.clone());
                    }
                    self.current_entry_index = i;
                    return true;
                }
            }
        }
        false
    }

    /// 获取下一批帧（串联播放，自动跨文件切换）
    pub fn next_batch(&mut self, max_count: usize) -> Result<Vec<PlaybackFrame>, PlaybackError> {
        if self.state != PlaybackState::Playing {
            return Ok(Vec::new());
        }
        if self.entries.is_empty() {
            return Ok(Vec::new());
        }

        let limit = max_count.min(1024);
        let mut batch = Vec::with_capacity(limit);
        let mut remaining = limit;
        let dbc = self.dbc.clone();

        while remaining > 0 {
            if self.current_entry_index >= self.entries.len() {
                if self.loop_enabled {
                    self.reset_all_entries();
                    self.current_entry_index = self.advance_to_next_enabled(0);
                } else {
                    self.state = PlaybackState::Stopped;
                    break;
                }
            }

            let entry = &mut self.entries[self.current_entry_index];
            if !entry.enabled {
                if !self.advance_entry() {
                    if self.loop_enabled {
                        self.reset_all_entries();
                        self.current_entry_index = self.advance_to_next_enabled(0);
                        continue;
                    }
                    self.state = PlaybackState::Stopped;
                    break;
                }
                continue;
            }

            if entry.engine.state() != PlaybackState::Playing {
                entry.engine.play();
                if let Some(ref dbc) = dbc {
                    entry.engine.set_dbc(dbc.clone());
                }
            }

            let inner_batch = entry.engine.next_batch(remaining)?;

            if inner_batch.is_empty() {
                if !self.advance_entry() {
                    if self.loop_enabled {
                        self.reset_all_entries();
                        self.current_entry_index = self.advance_to_next_enabled(0);
                        continue;
                    }
                    self.state = PlaybackState::Stopped;
                    break;
                }
                continue;
            }

            let offset = entry.global_start_offset;
            let count = inner_batch.len();
            for mut frame in inner_batch {
                frame.timestamp += offset;
                if let Some(ref dbc) = dbc {
                    let can_frame = canscope_core::CanFrame {
                        timestamp: frame.timestamp,
                        bus_id: frame.bus_id,
                        can_id: frame.can_id,
                        is_extended: frame.is_extended,
                        is_remote: false,
                        is_fd: frame.is_fd,
                        is_tx: frame.is_tx,
                        dlc: frame.dlc,
                        data: *frame.data,
                    };
                    frame.signals = dbc.decode_frame(&can_frame).ok();
                }
                self.global_time = Some(frame.timestamp);
                batch.push(frame);
            }
            self.global_frame_count += count as u64;
            remaining = remaining.saturating_sub(count);

            if remaining > 0 && entry.engine.state() == PlaybackState::Stopped {
                if !self.advance_entry() {
                    if self.loop_enabled {
                        self.reset_all_entries();
                        self.current_entry_index = self.advance_to_next_enabled(0);
                        continue;
                    }
                    self.state = PlaybackState::Stopped;
                    break;
                }
            }
        }

        Ok(batch)
    }

    /// 在全局时间线上定位到指定时间戳
    pub fn seek_to(&mut self, global_timestamp: f64) -> Result<(), PlaybackError> {
        self.global_time = Some(global_timestamp);

        for (i, entry) in self.entries.iter_mut().enumerate() {
            let end = entry.global_end_offset.unwrap_or(f64::MAX);
            if global_timestamp >= entry.global_start_offset && global_timestamp < end {
                let local_ts = global_timestamp - entry.global_start_offset;
                entry.engine.seek_to(local_ts)?;
                entry.engine.play();
                self.current_entry_index = i;
                return Ok(());
            }
        }

        // 超出所有文件范围：定位到最后一个文件的末尾
        if let Some(last) = self.entries.last_mut() {
            if let Some(dur) = last.engine.metadata().duration {
                last.engine.seek_to(dur)?;
            }
            last.engine.play();
            self.current_entry_index = self.entries.len().saturating_sub(1);
        }

        Ok(())
    }

    /// 当前位置在全局时间线上的进度（0.0 ~ 1.0）
    pub fn progress(&self) -> Option<f64> {
        let total = self.total_duration()?;
        if total <= 0.0 {
            return None;
        }
        self.global_time.map(|t| (t / total).clamp(0.0, 1.0))
    }

    /// 前进一帧
    pub fn step_forward(&mut self) -> Result<Option<PlaybackFrame>, PlaybackError> {
        if self.entries.is_empty() {
            return Ok(None);
        }

        if self.current_entry_index >= self.entries.len() {
            self.current_entry_index = self.entries.len().saturating_sub(1);
        }

        // Check if current entry is disabled; if so, advance
        if !self.entries[self.current_entry_index].enabled {
            if !self.advance_entry() {
                return Ok(None);
            }
        }

        let idx = self.current_entry_index;
        let dbc = self.dbc.clone();
        let entry = &mut self.entries[idx];
        if entry.engine.state() != PlaybackState::Playing {
            entry.engine.play();
            if let Some(ref dbc) = dbc {
                entry.engine.set_dbc(dbc.clone());
            }
        }
        let offset = entry.global_start_offset;

        let result = entry.engine.next_batch(1)?;
        if result.is_empty() {
            if !self.advance_entry() {
                return Ok(None);
            }
            let idx2 = self.current_entry_index;
            let entry2 = &mut self.entries[idx2];
            let dbc2 = self.dbc.clone();
            entry2.engine.play();
            if let Some(ref dbc) = dbc2 {
                entry2.engine.set_dbc(dbc.clone());
            }
            let offset2 = entry2.global_start_offset;
            let inner = entry2.engine.next_batch(1)?;
            if let Some(mut frame) = inner.into_iter().next() {
                frame.timestamp += offset2;
                self.global_time = Some(frame.timestamp);
                self.global_frame_count += 1;
                return Ok(Some(frame));
            }
            return Ok(None);
        }

        let mut frame = result.into_iter().next().unwrap();
        frame.timestamp += offset;
        self.global_time = Some(frame.timestamp);
        self.global_frame_count += 1;

        Ok(Some(frame))
    }

    /// 后退一帧
    pub fn step_back(&mut self) -> Result<Option<PlaybackFrame>, PlaybackError> {
        if self.entries.is_empty() {
            return Ok(None);
        }

        if self.current_entry_index >= self.entries.len() {
            self.current_entry_index = self.entries.len().saturating_sub(1);
        }

        let entry = &mut self.entries[self.current_entry_index];

        match entry.engine.step_back() {
            Ok(Some(mut frame)) => {
                frame.timestamp += entry.global_start_offset;
                self.global_time = Some(frame.timestamp);
                self.global_frame_count = self.global_frame_count.saturating_sub(1);
                return Ok(Some(frame));
            }
            Ok(None) => {}
            Err(e) => return Err(e),
        }

        // 当前条目无法后退：切换到前一个条目并 seek 到末尾
        if self.current_entry_index > 0 {
            let prev_idx = self.current_entry_index - 1;
            let prev_entry = &mut self.entries[prev_idx];
            if prev_entry.enabled {
                if let Some(end_offset) = prev_entry.global_end_offset {
                    let local_end = end_offset - prev_entry.global_start_offset;
                    let seek_ts = (local_end - 0.001).max(0.0);
                    prev_entry.engine.seek_to(seek_ts)?;
                    prev_entry.engine.play();
                    self.current_entry_index = prev_idx;
                    // 读取一帧再 step_back 定位到最后一帧的准确位置
                    if let Some(f) = prev_entry.engine.next_batch(1)?.into_iter().next() {
                        let ts = f.timestamp;
                        let _ = prev_entry.engine.seek_to(ts);
                        prev_entry.engine.play();
                        let mut frame = PlaybackFrame::from(canscope_core::CanFrame {
                            timestamp: ts,
                            bus_id: f.bus_id,
                            can_id: f.can_id,
                            is_extended: f.is_extended,
                            is_remote: false,
                            is_fd: f.is_fd,
                            is_tx: f.is_tx,
                            dlc: f.dlc,
                            data: *f.data,
                        });
                        frame.signals = f.signals;
                        frame.timestamp = ts + prev_entry.global_start_offset;
                        self.global_time = Some(frame.timestamp);
                        return Ok(Some(frame));
                    }
                }
            }
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use canscope_core::{CanFrame, SeekError, SourceType, FileFormat, StreamMetadata};

    struct MockStream {
        frames: Vec<CanFrame>,
        cursor: usize,
        metadata: StreamMetadata,
    }

    impl MockStream {
        fn new(frames: Vec<CanFrame>, start_time: &str, duration: Option<f64>) -> Self {
            let total = frames.len() as u64;
            Self {
                frames,
                cursor: 0,
                metadata: StreamMetadata {
                    source_type: SourceType::File {
                        path: PathBuf::from("mock.asc"),
                        format: FileFormat::Asc,
                    },
                    bus_type: canscope_core::BusType::Can,
                    bus_count: 1,
                    start_time: Some(start_time.to_string()),
                    total_frames: Some(total),
                    duration,
                },
            }
        }
    }

    impl CanFrameStream for MockStream {
        fn next(&mut self) -> Option<CanFrame> {
            if self.cursor >= self.frames.len() {
                return None;
            }
            let frame = self.frames[self.cursor].clone();
            self.cursor += 1;
            Some(frame)
        }

        fn seek(&mut self, timestamp: f64) -> Result<(), SeekError> {
            self.cursor = self
                .frames
                .binary_search_by(|f| f.timestamp.partial_cmp(&timestamp).unwrap())
                .unwrap_or_else(|i| i);
            Ok(())
        }

        fn metadata(&self) -> &StreamMetadata {
            &self.metadata
        }

        fn progress(&self) -> Option<f64> {
            if self.frames.is_empty() {
                return None;
            }
            Some(self.cursor as f64 / self.frames.len() as f64)
        }
    }

    fn make_frame(ts: f64, can_id: u32) -> CanFrame {
        CanFrame {
            timestamp: ts,
            bus_id: 0,
            can_id,
            is_extended: false,
            is_remote: false,
            is_fd: false,
            is_tx: false,
            dlc: 8,
            data: [0u8; 64],
        }
    }

    #[test]
    fn concatenation_plays_files_in_sequence() {
        let stream_a = MockStream::new(
            vec![make_frame(0.0, 0x100), make_frame(1.0, 0x101)],
            "2026-01-01T10:00:00",
            Some(2.0),
        );
        let stream_b = MockStream::new(
            vec![make_frame(0.5, 0x200), make_frame(1.5, 0x201)],
            "2026-01-01T11:00:00",
            Some(2.0),
        );

        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_a),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
        });
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_b),
            file_name: "b.asc".into(),
            file_path: "b.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
        });

        engine.play();
        let batch = engine.next_batch(10).unwrap();

        assert_eq!(batch.len(), 4);
        // File A plays first (earlier start_time)
        assert_eq!(batch[0].can_id, 0x100);
        assert!(batch[0].timestamp < 2.0);
        assert_eq!(batch[1].can_id, 0x101);
        // File B comes after, timestamps offset by file A's duration
        assert_eq!(batch[2].can_id, 0x200);
        assert!(batch[2].timestamp >= 2.0);
        assert_eq!(batch[3].can_id, 0x201);
    }

    #[test]
    fn toggle_disabled_file_skipped() {
        let stream_a = MockStream::new(
            vec![make_frame(0.0, 0x100)],
            "2026-01-01T10:00:00",
            Some(1.0),
        );
        let stream_b = MockStream::new(
            vec![make_frame(0.0, 0x200)],
            "2026-01-01T11:00:00",
            Some(1.0),
        );

        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_a),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
        });
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_b),
            file_name: "b.asc".into(),
            file_path: "b.asc".into(),
            enabled: false, // disabled
            global_start_offset: 0.0,
            global_end_offset: None,
        });

        engine.play();
        let batch = engine.next_batch(10).unwrap();

        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0].can_id, 0x100);
    }

    #[test]
    fn loop_wraps_around_all_files() {
        let stream = MockStream::new(
            vec![make_frame(0.0, 0x100)],
            "2026-01-01T10:00:00",
            Some(1.0),
        );

        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
        });
        engine.set_loop(true);
        engine.play();

        let batch = engine.next_batch(3).unwrap();
        assert_eq!(batch.len(), 3);
        assert_eq!(batch[0].can_id, 0x100);
        assert_eq!(batch[1].can_id, 0x100);
        assert_eq!(batch[2].can_id, 0x100);
    }

    #[test]
    fn seek_to_second_file() {
        let stream_a = MockStream::new(
            vec![make_frame(0.0, 0x100), make_frame(1.0, 0x101)],
            "2026-01-01T10:00:00",
            Some(2.0),
        );
        let stream_b = MockStream::new(
            vec![make_frame(0.5, 0x200), make_frame(1.5, 0x201)],
            "2026-01-01T11:00:00",
            Some(2.0),
        );

        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_a),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
        });
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_b),
            file_name: "b.asc".into(),
            file_path: "b.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
        });

        // File A duration=2.0, File B starts at global 2.0
        // Seek to global 3.0 = File B local 1.0
        engine.play();
        engine.seek_to(3.0).unwrap();

        let batch = engine.next_batch(1).unwrap();
        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0].can_id, 0x201); // frame at local 1.5
        assert!(batch[0].timestamp >= 3.0);
    }

    #[test]
    fn empty_playlist_returns_no_frames() {
        let mut engine: PlaylistEngine<MockStream> = PlaylistEngine::new();
        engine.play();
        let batch = engine.next_batch(10).unwrap();
        assert!(batch.is_empty());
    }
}