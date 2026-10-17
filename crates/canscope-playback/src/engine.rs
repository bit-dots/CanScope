use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use canscope_core::{CanFrame, CanFrameStream, SeekError, StreamMetadata};
use canscope_dbc::{Dbc, DecodedSignal};

use crate::error::PlaybackError;

const STEP_BACK_BUFFER: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackState {
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone)]
pub struct PlaybackFrame {
    pub timestamp: f64,
    pub bus_id: u8,
    pub can_id: u32,
    pub is_extended: bool,
    pub is_fd: bool,
    pub is_tx: bool,
    pub dlc: u8,
    pub data: Arc<[u8; 64]>,
    pub signals: Option<Vec<DecodedSignal>>,
}

impl From<CanFrame> for PlaybackFrame {
    fn from(f: CanFrame) -> Self {
        Self {
            timestamp: f.timestamp,
            bus_id: f.bus_id,
            can_id: f.can_id,
            is_extended: f.is_extended,
            is_fd: f.is_fd,
            is_tx: f.is_tx,
            dlc: f.dlc,
            data: Arc::new(f.data),
            signals: None,
        }
    }
}

pub struct PlaybackEngine<S> {
    stream: S,
    dbcs: HashMap<u8, Dbc>,
    state: PlaybackState,
    speed: f64,
    loop_enabled: bool,
    frame_count: u64,
    current_time: Option<f64>,
    recent_timestamps: VecDeque<f64>,
}

impl<S: CanFrameStream> PlaybackEngine<S> {
    pub fn new(stream: S) -> Self {
        Self {
            stream,
            dbcs: HashMap::new(),
            state: PlaybackState::Stopped,
            speed: 1.0,
            loop_enabled: false,
            frame_count: 0,
            current_time: None,
            recent_timestamps: VecDeque::with_capacity(STEP_BACK_BUFFER),
        }
    }

    pub fn set_dbcs(&mut self, dbcs: HashMap<u8, Dbc>) {
        self.dbcs = dbcs;
    }

    pub fn state(&self) -> PlaybackState {
        self.state
    }

    pub fn play(&mut self) {
        match self.state {
            PlaybackState::Stopped | PlaybackState::Paused => {
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

    pub fn current_time(&self) -> Option<f64> {
        self.current_time
    }

    pub fn frame_count(&self) -> u64 {
        self.frame_count
    }

    pub fn metadata(&self) -> &StreamMetadata {
        self.stream.metadata()
    }

    pub fn progress(&self) -> Option<f64> {
        self.stream.progress()
    }

    pub fn total_frames(&self) -> Option<u64> {
        self.metadata().total_frames
    }

    pub fn seek_to(&mut self, timestamp: f64) -> Result<(), PlaybackError> {
        self.stream.seek(timestamp).map_err(|e| match e {
            SeekError::NotSupported => PlaybackError::SeekError(e.to_string()),
            SeekError::OutOfRange { .. } => PlaybackError::SeekError(e.to_string()),
            SeekError::IoError(_) => PlaybackError::SeekError(e.to_string()),
        })?;

        self.recent_timestamps.clear();
        self.frame_count = 0;
        self.current_time = None;
        Ok(())
    }

    pub fn step_back(&mut self) -> Result<Option<PlaybackFrame>, PlaybackError> {
        let _discarded = self.recent_timestamps.pop_back();

        let target_ts = match self.recent_timestamps.back().copied() {
            Some(ts) => ts,
            None => return Ok(None),
        };

        self.stream.seek(target_ts).map_err(|e| match e {
            SeekError::NotSupported => PlaybackError::SeekError(e.to_string()),
            SeekError::OutOfRange { .. } => PlaybackError::SeekError(e.to_string()),
            SeekError::IoError(_) => PlaybackError::SeekError(e.to_string()),
        })?;

        let frame = match self.stream.next() {
            Some(f) => f,
            None => return Ok(None),
        };

        self.current_time = Some(frame.timestamp);
        self.frame_count = self.frame_count.saturating_sub(1);

        let dbc = self.dbcs.get(&frame.bus_id);
        let signals = dbc.and_then(|dbc| dbc.decode_frame(&frame).ok());

        Ok(Some(PlaybackFrame {
            timestamp: frame.timestamp,
            bus_id: frame.bus_id,
            can_id: frame.can_id,
            is_extended: frame.is_extended,
            is_fd: frame.is_fd,
            is_tx: frame.is_tx,
            dlc: frame.dlc,
            data: Arc::new(frame.data),
            signals,
        }))
    }

    pub fn next_batch(&mut self, max_count: usize) -> Result<Vec<PlaybackFrame>, PlaybackError> {
        let limit = max_count.min(1024);
        let mut batch = Vec::with_capacity(limit);
        let mut remaining = limit;
        let mut loop_count = 0;

        while remaining > 0 {
            match self.stream.next() {
                Some(frame) => {
                    let ts = frame.timestamp;

                    if self.recent_timestamps.len() >= STEP_BACK_BUFFER {
                        self.recent_timestamps.pop_front();
                    }
                    self.recent_timestamps.push_back(ts);

                    self.current_time = Some(ts);
                    self.frame_count += 1;

                    let dbc = self.dbcs.get(&frame.bus_id);
                    let signals = dbc
                        .and_then(|dbc| dbc.decode_frame(&frame).ok());

                    batch.push(PlaybackFrame {
                        timestamp: ts,
                        bus_id: frame.bus_id,
                        can_id: frame.can_id,
                        is_extended: frame.is_extended,
                        is_fd: frame.is_fd,
                        is_tx: frame.is_tx,
                        dlc: frame.dlc,
                        data: Arc::new(frame.data),
                        signals,
                    });
                    remaining -= 1;
                }
                None => {
                    if self.loop_enabled {
                        loop_count += 1;
                        if loop_count > 1 {
                            self.state = PlaybackState::Stopped;
                            break;
                        }
                        let _ = self.stream.seek(0.0);
                        self.recent_timestamps.clear();
                        self.frame_count = 0;
                        self.current_time = None;
                        continue;
                    }
                    self.state = PlaybackState::Stopped;
                    break;
                }
            }
        }

        Ok(batch)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct MockStream {
        frames: Vec<CanFrame>,
        cursor: usize,
        metadata: StreamMetadata,
    }

    impl MockStream {
        fn new(frames: Vec<CanFrame>) -> Self {
            let total = frames.len() as u64;
            let duration = frames.last().map(|f| f.timestamp);
            Self {
                frames,
                cursor: 0,
                metadata: StreamMetadata {
                    source_type: canscope_core::SourceType::File {
                        path: PathBuf::from("mock.asc"),
                        format: canscope_core::FileFormat::Asc,
                    },
                    bus_type: canscope_core::BusType::Can,
                    bus_count: 1,
                    start_time: None,
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
                .binary_search_by(|f| {
                    f.timestamp
                        .partial_cmp(&timestamp)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .unwrap_or_else(|idx| idx);
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

    fn make_frame(ts: f64, can_id: u32, data: &[u8]) -> CanFrame {
        let mut arr = [0u8; 64];
        arr[..data.len()].copy_from_slice(data);
        CanFrame {
            timestamp: ts,
            bus_id: 0,
            can_id,
            is_extended: false,
            is_remote: false,
            is_fd: false,
            is_tx: false,
            dlc: data.len() as u8,
            data: arr,
        }
    }

    #[test]
    fn initial_state_is_stopped() {
        let stream = MockStream::new(vec![]);
        let engine = PlaybackEngine::new(stream);
        assert_eq!(engine.state(), PlaybackState::Stopped);
        assert_eq!(engine.speed(), 1.0);
        assert_eq!(engine.current_time(), None);
        assert_eq!(engine.frame_count(), 0);
    }

    #[test]
    fn play_pause_stop_transitions() {
        let stream = MockStream::new(vec![]);
        let mut engine = PlaybackEngine::new(stream);

        assert_eq!(engine.state(), PlaybackState::Stopped);

        engine.play();
        assert_eq!(engine.state(), PlaybackState::Playing);

        engine.pause();
        assert_eq!(engine.state(), PlaybackState::Paused);

        engine.play();
        assert_eq!(engine.state(), PlaybackState::Playing);

        engine.stop();
        assert_eq!(engine.state(), PlaybackState::Stopped);
    }

    #[test]
    fn next_batch_reads_frames() {
        let frames: Vec<CanFrame> = (0..10)
            .map(|i| make_frame(i as f64, 0x100 + i, &[i as u8]))
            .collect();
        let stream = MockStream::new(frames);
        let mut engine = PlaybackEngine::new(stream);

        engine.play();
        let batch = engine.next_batch(5).unwrap();

        assert_eq!(batch.len(), 5);
        assert_eq!(batch[0].can_id, 0x100);
        assert_eq!(batch[4].can_id, 0x104);
        assert_eq!(engine.current_time(), Some(4.0));
        assert_eq!(engine.frame_count(), 5);
    }

    #[test]
    fn next_batch_stops_at_end() {
        let frames: Vec<CanFrame> = (0..3)
            .map(|i| make_frame(i as f64, 0x200, &[i as u8]))
            .collect();
        let stream = MockStream::new(frames);
        let mut engine = PlaybackEngine::new(stream);

        engine.play();
        let batch = engine.next_batch(10).unwrap();

        assert_eq!(batch.len(), 3);
        assert_eq!(engine.state(), PlaybackState::Stopped);
    }

    #[test]
    fn loop_playback_wraps_around() {
        let frames: Vec<CanFrame> = (0..3)
            .map(|i| make_frame(i as f64, 0x200, &[i as u8]))
            .collect();
        let stream = MockStream::new(frames);
        let mut engine = PlaybackEngine::new(stream);

        engine.set_loop(true);
        engine.play();

        let batch1 = engine.next_batch(5).unwrap();
        assert_eq!(batch1.len(), 5);
        assert_eq!(batch1[0].can_id, 0x200);
        assert_eq!(batch1[3].can_id, 0x200);

        assert_eq!(engine.state(), PlaybackState::Playing);
    }

    #[test]
    fn seek_to_timestamp() {
        let frames: Vec<CanFrame> = (0..10)
            .map(|i| make_frame(i as f64 * 0.5, 0x100 + i, &[]))
            .collect();
        let stream = MockStream::new(frames);
        let mut engine = PlaybackEngine::new(stream);

        engine.play();
        engine.seek_to(3.0).unwrap();

        let batch = engine.next_batch(3).unwrap();
        assert!((batch[0].timestamp - 3.0).abs() < 0.01);
        assert_eq!(engine.current_time().unwrap(), 4.0);
    }

    #[test]
    fn step_back_restores_previous_frame() {
        let frames: Vec<CanFrame> = (0..5)
            .map(|i| make_frame(i as f64, 0x100 + i, &[i as u8]))
            .collect();
        let stream = MockStream::new(frames);
        let mut engine = PlaybackEngine::new(stream);

        engine.play();

        let batch = engine.next_batch(3).unwrap();
        assert_eq!(batch.len(), 3);
        assert_eq!(batch[2].can_id, 0x102);

        let prev = engine.step_back().unwrap().unwrap();
        assert_eq!(prev.can_id, 0x101);

        let prev2 = engine.step_back().unwrap().unwrap();
        assert_eq!(prev2.can_id, 0x100);

        assert!(engine.step_back().unwrap().is_none());
    }

    #[test]
    fn set_speed_clamps_values() {
        let stream = MockStream::new(vec![]);
        let mut engine = PlaybackEngine::new(stream);

        engine.set_speed(2.0);
        assert_eq!(engine.speed(), 2.0);

        engine.set_speed(-1.0);
        assert_eq!(engine.speed(), 0.1);

        engine.set_speed(100.0);
        assert_eq!(engine.speed(), 32.0);
    }

    #[test]
    fn metadata_returns_stream_info() {
        let frames: Vec<CanFrame> = (0..5)
            .map(|i| make_frame(i as f64, 0x100 + i, &[]))
            .collect();
        let stream = MockStream::new(frames);
        let engine = PlaybackEngine::new(stream);

        assert_eq!(engine.total_frames(), Some(5));
        assert!((engine.metadata().duration.unwrap() - 4.0).abs() < 0.01);
    }
}