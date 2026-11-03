use std::collections::HashMap;
use std::time::Instant;

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
    /// 文件内播放起始偏移（秒），0.0 表示从文件开头播放
    pub play_start_offset: f64,
    /// 文件内播放结束偏移（秒），None 表示播放到文件末尾
    pub play_end_offset: Option<f64>,
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
    dbcs: HashMap<u8, Dbc>,
    current_entry_index: usize,
    global_time: Option<f64>,
    global_frame_count: u64,
    pending_frame: Option<PlaybackFrame>,
    playback_clock: Option<(Instant, f64)>,
}

impl<S: CanFrameStream> PlaylistEngine<S> {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            state: PlaybackState::Stopped,
            speed: 1.0,
            loop_enabled: false,
            dbcs: HashMap::new(),
            current_entry_index: 0,
            global_time: None,
            global_frame_count: 0,
            pending_frame: None,
            playback_clock: None,
        }
    }

    pub fn state(&self) -> PlaybackState {
        self.state
    }

    pub fn speed(&self) -> f64 {
        self.speed
    }

    pub fn set_speed(&mut self, speed: f64) {
        let now = Instant::now();
        let current_time = self.clock_time(now).or(self.global_time);
        self.speed = speed.clamp(0.1, 32.0);
        if self.state == PlaybackState::Playing {
            if let Some(timestamp) = current_time {
                self.playback_clock = Some((now, timestamp));
            }
        }
    }

    fn clock_time(&self, now: Instant) -> Option<f64> {
        self.playback_clock.map(|(started, media_started)| {
            media_started + now.saturating_duration_since(started).as_secs_f64() * self.speed
        })
    }

    pub fn set_loop(&mut self, enabled: bool) {
        self.loop_enabled = enabled;
    }

    pub fn loop_enabled(&self) -> bool {
        self.loop_enabled
    }

    pub fn set_dbcs(&mut self, dbcs: HashMap<u8, Dbc>) {
        self.dbcs = dbcs;
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
        self.recalc_offsets();
    }

    /// 设置文件的播放裁剪区间
    pub fn set_entry_offsets(
        &mut self,
        index: usize,
        play_start_offset: f64,
        play_end_offset: Option<f64>,
    ) {
        if let Some(entry) = self.entries.get_mut(index) {
            if let Some(duration) = entry.engine.metadata().duration {
                let min_span = 0.1_f64.min(duration);
                let start = play_start_offset.clamp(0.0, (duration - min_span).max(0.0));
                let end = play_end_offset
                    .unwrap_or(duration)
                    .clamp(start + min_span, duration);
                entry.play_start_offset = start;
                entry.play_end_offset = (end < duration).then_some(end);
            } else {
                entry.play_start_offset = play_start_offset.max(0.0);
                entry.play_end_offset = play_end_offset;
            }
        }
        self.recalc_offsets();
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

    /// 按原始时间戳排序并重新计算所选播放范围的全局时间偏移
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
            if entry.enabled {
                if let Some(dur) = Self::entry_play_duration(entry) {
                    cumulative += dur;
                }
            }
            if entry.enabled {
                if Self::entry_play_duration(entry).is_some() {
                    entry.global_end_offset = Some(cumulative);
                } else {
                    entry.global_end_offset = None;
                }
            } else {
                entry.global_end_offset = Some(cumulative);
            }
        }
    }

    fn entry_play_end(entry: &PlaylistEntry<S>) -> Option<f64> {
        entry.engine.metadata().duration.map(|duration| {
            entry.engine.stream().timestamp_origin()
                + entry.play_end_offset.unwrap_or(duration).min(duration)
        })
    }

    fn entry_play_duration(entry: &PlaylistEntry<S>) -> Option<f64> {
        let duration = entry.engine.metadata().duration?;
        let end = entry.play_end_offset.unwrap_or(duration).min(duration);
        Some((end - entry.play_start_offset).max(0.0))
    }

    fn activate_entry(&mut self, index: usize) -> Result<(), PlaybackError> {
        let dbcs = self.dbcs.clone();
        let entry = &mut self.entries[index];
        entry
            .engine
            .seek_to(entry.engine.stream().timestamp_origin() + entry.play_start_offset)?;
        entry.engine.play();
        entry.engine.set_dbcs(dbcs);
        self.current_entry_index = index;
        Ok(())
    }

    /// 获取所有启用文件的所选播放范围总时长，单位秒
    pub fn total_duration(&self) -> Option<f64> {
        let mut sum = 0.0;
        for entry in &self.entries {
            if entry.enabled {
                sum += Self::entry_play_duration(entry)?;
            }
        }
        Some(sum)
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
        if all_known {
            Some(sum)
        } else {
            None
        }
    }

    pub fn play(&mut self) -> Result<(), PlaybackError> {
        match self.state {
            PlaybackState::Stopped => {
                self.reset_all_entries();
                self.current_entry_index = self.advance_to_next_enabled(0);
                self.global_time = None;
                self.global_frame_count = 0;
                self.pending_frame = None;
                self.playback_clock = None;
                if self
                    .entries
                    .get(self.current_entry_index)
                    .is_some_and(|entry| entry.enabled)
                {
                    self.activate_entry(self.current_entry_index)?;
                    self.state = PlaybackState::Playing;
                }
            }
            PlaybackState::Paused => {
                self.state = PlaybackState::Playing;
                let timestamp = self
                    .global_time
                    .or_else(|| self.pending_frame.as_ref().map(|frame| frame.timestamp));
                self.playback_clock = timestamp.map(|timestamp| (Instant::now(), timestamp));
            }
            PlaybackState::Playing => {}
        }
        Ok(())
    }

    pub fn pause(&mut self) {
        if self.state == PlaybackState::Playing {
            self.global_time = self.clock_time(Instant::now()).or(self.global_time);
            self.state = PlaybackState::Paused;
            self.playback_clock = None;
        }
    }

    pub fn stop(&mut self) {
        self.state = PlaybackState::Stopped;
        self.global_time = None;
        self.global_frame_count = 0;
        self.pending_frame = None;
        self.playback_clock = None;
        self.reset_all_entries();
    }

    fn reset_all_entries(&mut self) {
        let dbcs = self.dbcs.clone();
        for entry in &mut self.entries {
            entry.engine.stop();
            let _ = entry.engine.seek_to(0.0);
            entry.engine.set_loop(false);
            entry.engine.set_dbcs(dbcs.clone());
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
    fn advance_entry(&mut self) -> Result<bool, PlaybackError> {
        let start = self.current_entry_index;
        let len = self.entries.len();
        if len == 0 {
            return Ok(false);
        }

        let steps = if self.loop_enabled {
            len
        } else {
            len.saturating_sub(start + 1)
        };
        for step in 1..=steps {
            let idx = if self.loop_enabled {
                (start + step) % len
            } else {
                start + step
            };
            if self.entries[idx].enabled {
                self.activate_entry(idx)?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// 获取下一批帧（串联播放，自动跨文件切换）
    pub fn next_batch(&mut self, max_count: usize) -> Result<Vec<PlaybackFrame>, PlaybackError> {
        if self.state != PlaybackState::Playing || self.entries.is_empty() {
            return Ok(Vec::new());
        }

        let limit = max_count.min(1024);
        let mut batch = Vec::with_capacity(limit);
        let mut remaining = limit;

        while remaining > 0 {
            if self.current_entry_index >= self.entries.len() {
                self.state = PlaybackState::Stopped;
                break;
            }

            if !self.entries[self.current_entry_index].enabled {
                if !self.advance_entry()? {
                    self.state = PlaybackState::Stopped;
                    break;
                }
                continue;
            }

            let (inner_batch, start, end, global_start, engine_stopped) = {
                let entry = &mut self.entries[self.current_entry_index];
                if entry.engine.state() != PlaybackState::Playing {
                    entry.engine.play();
                    entry.engine.set_dbcs(self.dbcs.clone());
                }
                let inner_batch = entry.engine.next_batch(remaining)?;
                (
                    inner_batch,
                    entry.engine.stream().timestamp_origin() + entry.play_start_offset,
                    Self::entry_play_end(entry).unwrap_or(f64::MAX),
                    entry.global_start_offset,
                    entry.engine.state() == PlaybackState::Stopped,
                )
            };

            let mut range_ended = false;
            let before_count = batch.len();
            for mut frame in inner_batch {
                if frame.timestamp < start {
                    continue;
                }
                if frame.timestamp > end {
                    range_ended = true;
                    break;
                }
                frame.timestamp = global_start + frame.timestamp - start;
                self.global_time = Some(frame.timestamp);
                batch.push(frame);
            }
            let count = batch.len() - before_count;
            self.global_frame_count += count as u64;
            remaining = remaining.saturating_sub(count);

            if range_ended || engine_stopped || count == 0 {
                if !self.advance_entry()? {
                    self.state = PlaybackState::Stopped;
                    break;
                }
            }
        }

        Ok(batch)
    }

    /// Return only frames whose log timestamps have elapsed at the selected playback speed.
    pub fn next_batch_timed(
        &mut self,
        max_count: usize,
        now: Instant,
    ) -> Result<Vec<PlaybackFrame>, PlaybackError> {
        if self.state != PlaybackState::Playing || max_count == 0 {
            return Ok(Vec::new());
        }

        if self.playback_clock.is_none() {
            if let Some(frame) = self.pending_frame.take() {
                self.playback_clock = Some((now, frame.timestamp));
                self.global_time = Some(frame.timestamp);
                self.global_frame_count += 1;
                return Ok(vec![frame]);
            }

            let Some(frame) = self.next_batch(1)?.into_iter().next() else {
                return Ok(Vec::new());
            };
            self.playback_clock = Some((now, frame.timestamp));
            return Ok(vec![frame]);
        }

        let (clock_started, media_started) = self.playback_clock.expect("clock was initialized");
        let elapsed = now.saturating_duration_since(clock_started).as_secs_f64();
        let mut playback_time = media_started + elapsed * self.speed;
        let mut batch = Vec::with_capacity(max_count.min(1024));

        while batch.len() < max_count.min(1024) {
            if self.pending_frame.is_none() {
                let last_emitted_time = self.global_time;
                let Some(frame) = self.next_batch(1)?.into_iter().next() else {
                    break;
                };
                self.pending_frame = Some(frame);
                self.global_frame_count = self.global_frame_count.saturating_sub(1);
                self.global_time = batch
                    .last()
                    .map(|frame: &PlaybackFrame| frame.timestamp)
                    .or(last_emitted_time);
            }

            let frame = self
                .pending_frame
                .as_ref()
                .expect("pending frame was loaded");
            if self.global_time.is_some_and(|last| frame.timestamp < last) {
                self.playback_clock = Some((now, frame.timestamp));
                playback_time = frame.timestamp;
            }
            if frame.timestamp > playback_time {
                break;
            }

            let frame = self.pending_frame.take().expect("pending frame was loaded");
            self.global_time = Some(frame.timestamp);
            self.global_frame_count += 1;
            batch.push(frame);
        }

        if self.state == PlaybackState::Stopped {
            self.playback_clock = None;
        }

        Ok(batch)
    }

    /// 在全局时间线上定位到指定时间戳
    pub fn seek_to(&mut self, global_timestamp: f64) -> Result<(), PlaybackError> {
        self.pending_frame = None;
        self.playback_clock = None;
        self.global_time = Some(global_timestamp);

        for (i, entry) in self.entries.iter_mut().enumerate() {
            let end = entry.global_end_offset.unwrap_or(f64::MAX);
            if entry.enabled
                && global_timestamp >= entry.global_start_offset
                && global_timestamp < end
            {
                let local_ts = entry.engine.stream().timestamp_origin()
                    + entry.play_start_offset
                    + global_timestamp
                    - entry.global_start_offset;
                entry.engine.seek_to(local_ts)?;
                entry.engine.play();
                self.current_entry_index = i;
                return Ok(());
            }
        }

        // 超出所有文件范围：定位到最后一个启用文件的播放范围末尾
        if let Some((index, last)) = self
            .entries
            .iter_mut()
            .enumerate()
            .rev()
            .find(|(_, entry)| entry.enabled)
        {
            if let Some(end) = Self::entry_play_end(last) {
                last.engine.seek_to(end)?;
            }
            last.engine.play();
            self.current_entry_index = index;
        }

        Ok(())
    }

    /// 当前位置在全局时间线上的进度（0.0 ~ 1.0）
    pub fn progress(&self) -> Option<f64> {
        let total = self.total_duration()?;
        if total <= 0.0 {
            return None;
        }
        let current_time = if self.state == PlaybackState::Playing {
            self.clock_time(Instant::now()).or(self.global_time)
        } else {
            self.global_time
        }?;
        Some((current_time / total).clamp(0.0, 1.0))
    }

    /// 前进一帧
    pub fn step_forward(&mut self) -> Result<Option<PlaybackFrame>, PlaybackError> {
        self.playback_clock = None;
        if let Some(frame) = self.pending_frame.take() {
            self.global_time = Some(frame.timestamp);
            self.global_frame_count += 1;
            return Ok(Some(frame));
        }
        if self.entries.is_empty() {
            return Ok(None);
        }

        if self.state == PlaybackState::Stopped && self.global_time.is_none() {
            self.reset_all_entries();
            self.current_entry_index = self.advance_to_next_enabled(0);
            if !self
                .entries
                .get(self.current_entry_index)
                .is_some_and(|entry| entry.enabled)
            {
                return Ok(None);
            }
            self.activate_entry(self.current_entry_index)?;
        }

        let previous_state = self.state;
        self.state = PlaybackState::Playing;
        let result = self.next_batch(1);
        if previous_state != PlaybackState::Playing {
            match &result {
                Ok(frames) if !frames.is_empty() => self.state = previous_state,
                Err(_) => self.state = previous_state,
                _ => {}
            }
        }
        self.playback_clock = None;
        Ok(result?.into_iter().next())
    }

    /// 后退一帧
    pub fn step_back(&mut self) -> Result<Option<PlaybackFrame>, PlaybackError> {
        self.playback_clock = None;
        self.pending_frame = None;
        if self.entries.is_empty() {
            return Ok(None);
        }

        if self.current_entry_index >= self.entries.len() {
            self.current_entry_index = self.entries.len().saturating_sub(1);
        }

        let entry = &mut self.entries[self.current_entry_index];

        match entry.engine.step_back() {
            Ok(Some(mut frame)) => {
                let origin = entry.engine.stream().timestamp_origin();
                if frame.timestamp >= origin + entry.play_start_offset
                    && Self::entry_play_end(entry).map_or(true, |end| frame.timestamp <= end)
                {
                    frame.timestamp = entry.global_start_offset + frame.timestamp
                        - origin
                        - entry.play_start_offset;
                    self.global_time = Some(frame.timestamp);
                    self.global_frame_count = self.global_frame_count.saturating_sub(1);
                    return Ok(Some(frame));
                }
            }
            Ok(None) => {}
            Err(e) => return Err(e),
        }

        // 当前条目无法后退：切换到前一个启用条目的播放范围末尾
        if let Some(prev_idx) = (0..self.current_entry_index)
            .rev()
            .find(|&index| self.entries[index].enabled)
        {
            let prev_entry = &mut self.entries[prev_idx];
            if let Some(end) = Self::entry_play_end(prev_entry) {
                let origin = prev_entry.engine.stream().timestamp_origin();
                let seek_ts = (end - 0.001).max(origin + prev_entry.play_start_offset);
                prev_entry.engine.seek_to(seek_ts)?;
                prev_entry.engine.play();
                self.current_entry_index = prev_idx;
                if let Some(mut frame) = prev_entry.engine.next_batch(1)?.into_iter().next() {
                    if frame.timestamp <= end
                        && frame.timestamp >= origin + prev_entry.play_start_offset
                    {
                        let local_ts = frame.timestamp;
                        frame.timestamp = prev_entry.global_start_offset + frame.timestamp
                            - origin
                            - prev_entry.play_start_offset;
                        prev_entry.engine.seek_to(local_ts)?;
                        prev_entry.engine.play();
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
    use canscope_core::{CanFrame, FileFormat, SeekError, SourceType, StreamMetadata};
    use std::path::PathBuf;
    use std::time::Duration;

    struct MockStream {
        frames: Vec<CanFrame>,
        cursor: usize,
        timestamp_origin: f64,
        metadata: StreamMetadata,
    }

    impl MockStream {
        fn new(frames: Vec<CanFrame>, start_time: &str, duration: Option<f64>) -> Self {
            let total = frames.len() as u64;
            Self {
                frames,
                cursor: 0,
                timestamp_origin: 0.0,
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

        fn with_timestamp_origin(mut self, timestamp_origin: f64) -> Self {
            self.timestamp_origin = timestamp_origin;
            self
        }
    }

    impl CanFrameStream for MockStream {
        fn next(&mut self) -> Result<Option<CanFrame>, SeekError> {
            if self.cursor >= self.frames.len() {
                return Ok(None);
            }
            let frame = self.frames[self.cursor].clone();
            self.cursor += 1;
            Ok(Some(frame))
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

        fn timestamp_origin(&self) -> f64 {
            self.timestamp_origin
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
            is_brs: false,
            is_error: false,
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
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_b),
            file_name: "b.asc".into(),
            file_path: "b.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });

        engine.play().unwrap();
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
    fn timed_playback_releases_frames_by_timestamp() {
        let stream = MockStream::new(
            vec![
                make_frame(0.0, 0x100),
                make_frame(0.02, 0x101),
                make_frame(0.04, 0x102),
                make_frame(0.06, 0x103),
            ],
            "2026-01-01T10:00:00",
            Some(0.06),
        );
        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.play().unwrap();

        let start = Instant::now();
        let first = engine.next_batch_timed(100, start).unwrap();
        assert_eq!(
            first.iter().map(|frame| frame.can_id).collect::<Vec<_>>(),
            [0x100]
        );

        let second = engine
            .next_batch_timed(100, start + Duration::from_millis(50))
            .unwrap();
        assert_eq!(
            second.iter().map(|frame| frame.can_id).collect::<Vec<_>>(),
            [0x101, 0x102]
        );

        let third = engine
            .next_batch_timed(100, start + Duration::from_millis(100))
            .unwrap();
        assert_eq!(
            third.iter().map(|frame| frame.can_id).collect::<Vec<_>>(),
            [0x103]
        );
    }

    #[test]
    fn progress_advances_smoothly_between_sparse_frames() {
        let stream = MockStream::new(
            vec![make_frame(5.0, 0x100), make_frame(9.0, 0x101)],
            "2026-01-01T10:00:00",
            Some(10.0),
        );
        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.play().unwrap();

        let first = engine.next_batch_timed(10, Instant::now()).unwrap();
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].timestamp, 5.0);
        std::thread::sleep(Duration::from_millis(20));

        let progress = engine.progress().unwrap();
        assert!(progress > 0.5);
        assert!(progress < 0.51);
    }

    #[test]
    fn playback_progress_is_relative_to_nonzero_timestamp_origin() {
        let stream = MockStream::new(
            vec![
                make_frame(5.0, 0x100),
                make_frame(7.0, 0x101),
                make_frame(9.0, 0x102),
            ],
            "2026-01-01T10:00:00",
            Some(4.0),
        )
        .with_timestamp_origin(5.0);
        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.play().unwrap();

        let first = engine.next_batch_timed(1, Instant::now()).unwrap();
        assert_eq!(first[0].timestamp, 0.0);
        assert!(engine.progress().unwrap() < 0.01);
        assert_eq!(engine.total_duration(), Some(4.0));

        engine.seek_to(1.0).unwrap();
        let sought = engine.next_batch(1).unwrap();
        assert_eq!(sought[0].can_id, 0x101);
        assert_eq!(sought[0].timestamp, 2.0);
    }

    #[test]
    fn playback_uses_each_entry_play_range() {
        let frames_a = (0..=5).map(|i| make_frame(i as f64, 0x100 + i)).collect();
        let frames_b = (0..=2).map(|i| make_frame(i as f64, 0x200 + i)).collect();
        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(MockStream::new(
                frames_a,
                "2026-01-01T10:00:00",
                Some(5.0),
            )),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(MockStream::new(
                frames_b,
                "2026-01-01T11:00:00",
                Some(2.0),
            )),
            file_name: "b.asc".into(),
            file_path: "b.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });

        engine.set_entry_offsets(0, 1.0, Some(3.0));
        assert_eq!(engine.total_duration(), Some(4.0));
        engine.play().unwrap();

        let frames = engine.next_batch(10).unwrap();
        assert_eq!(
            frames.iter().map(|frame| frame.can_id).collect::<Vec<_>>(),
            [0x101, 0x102, 0x103, 0x200, 0x201, 0x202]
        );
        assert_eq!(
            frames
                .iter()
                .map(|frame| frame.timestamp)
                .collect::<Vec<_>>(),
            [0.0, 1.0, 2.0, 2.0, 3.0, 4.0]
        );
    }

    #[test]
    fn seek_uses_clipped_entry_offsets() {
        let frames = (0..=5).map(|i| make_frame(i as f64, 0x100 + i)).collect();
        let mut engine = PlaylistEngine::new();
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(MockStream::new(frames, "2026-01-01T10:00:00", Some(5.0))),
            file_name: "a.asc".into(),
            file_path: "a.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.set_entry_offsets(0, 2.0, Some(4.0));
        engine.play().unwrap();
        engine.seek_to(1.0).unwrap();

        let frame = engine.next_batch(1).unwrap().remove(0);
        assert_eq!(frame.can_id, 0x103);
        assert_eq!(frame.timestamp, 1.0);
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
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_b),
            file_name: "b.asc".into(),
            file_path: "b.asc".into(),
            enabled: false, // disabled
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });

        engine.play().unwrap();
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
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.set_loop(true);
        engine.play().unwrap();

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
            play_start_offset: 0.0,
            play_end_offset: None,
        });
        engine.add_entry(PlaylistEntry {
            engine: PlaybackEngine::new(stream_b),
            file_name: "b.asc".into(),
            file_path: "b.asc".into(),
            enabled: true,
            global_start_offset: 0.0,
            global_end_offset: None,
            play_start_offset: 0.0,
            play_end_offset: None,
        });

        // File A duration=2.0, File B starts at global 2.0
        // Seek to global 3.0 = File B local 1.0
        engine.play().unwrap();
        engine.seek_to(3.0).unwrap();

        let batch = engine.next_batch(1).unwrap();
        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0].can_id, 0x201); // frame at local 1.5
        assert!(batch[0].timestamp >= 3.0);
    }

    #[test]
    fn empty_playlist_returns_no_frames() {
        let mut engine: PlaylistEngine<MockStream> = PlaylistEngine::new();
        engine.play().unwrap();
        let batch = engine.next_batch(10).unwrap();
        assert!(batch.is_empty());
    }
}
