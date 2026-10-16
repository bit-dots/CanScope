use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

/// 一帧 CAN 报文。
///
/// 兼容 CAN 2.0（8 字节）和 CAN FD（最长 64 字节）。
/// 时间戳统一为相对偏移（秒），由上层决定零点含义。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanFrame {
    /// 相对时间偏移（秒），零点由数据源定义
    pub timestamp: f64,

    /// 总线通道号（0-based）
    pub bus_id: u8,

    /// CAN 报文 ID（11-bit 或 29-bit）
    pub can_id: u32,

    /// 是否为扩展帧（29-bit ID）
    pub is_extended: bool,

    /// 是否为远程传输请求帧
    pub is_remote: bool,

    /// 是否为 CAN FD 帧
    pub is_fd: bool,

    /// 是否为发送帧（false = RX, true = TX）
    pub is_tx: bool,

    /// 数据长度码（CAN 2.0: 0-8, CAN FD: 0-64）
    pub dlc: u8,

    /// 数据负载，CAN FD 最长 64 字节
    #[serde(with = "serde_bytes")]
    pub data: [u8; 64],
}

impl CanFrame {
    /// 有效数据切片，按 `dlc` 截取
    pub fn payload(&self) -> &[u8] {
        let len = (self.dlc as usize).min(64);
        &self.data[..len]
    }
}

/// 数据源类型。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SourceType {
    /// 来自文件的离线数据
    File {
        path: PathBuf,
        format: FileFormat,
    },
    /// 来自硬件适配器的实时数据
    Live {
        adapter: String,
    },
}

/// 总线/通道类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BusType {
    Can,
    Lin,
    FlexRay,
    Most,
    Ethernet,
    Unknown,
}

impl Default for BusType {
    fn default() -> Self {
        Self::Unknown
    }
}

/// 支持的 CAN 日志文件格式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileFormat {
    /// Vector ASC 文本格式
    Asc,
    /// 通用 CSV 格式
    Csv,
    /// Vector BLF 二进制格式（Phase 2）
    Blf,
    /// PEAK TRC 格式（Phase 2）
    Trc,
    /// MDF/MF4 格式（Phase 3+）
    Mdf,
}

/// 数据源的元数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamMetadata {
    /// 数据源类型
    pub source_type: SourceType,

    /// 总线/通道类型（CAN / LIN / FlexRay ...）
    pub bus_type: BusType,

    /// 总线通道数
    pub bus_count: u8,

    /// 数据起始时刻（绝对时间，文件模式从文件头解析，实时模式为连接时刻）
    pub start_time: Option<String>,

    /// 总帧数（文件模式：已知；实时模式：None）
    pub total_frames: Option<u64>,

    /// 总时长（文件模式：已知；实时模式：None），单位秒
    pub duration: Option<f64>,
}

/// Seek 操作的错误类型。
#[derive(Debug, Error)]
pub enum SeekError {
    /// 该数据源不支持 Seek（例如实时硬件源）
    #[error("seek is not supported for this source type")]
    NotSupported,

    /// 请求的时间戳超出数据范围
    #[error("timestamp {requested} is out of range [{min}, {max}]")]
    OutOfRange {
        requested: f64,
        min: f64,
        max: f64,
    },

    /// Seek 过程发生 I/O 错误
    #[error("seek failed: {0}")]
    IoError(String),
}

/// 统一的 CAN 帧数据流抽象。
///
/// 无论是从文件读取还是从实时硬件接收，上层都通过这个 Trait
/// 消费 CAN 帧，实现数据源与业务逻辑的完全解耦。
///
/// Phase 1 只有文件源实现；Phase 3 添加实时硬件源。
pub trait CanFrameStream: Send + Sync {
    /// 获取下一帧。返回 `None` 表示数据流已结束。
    fn next(&mut self) -> Option<CanFrame>;

    /// 定位到指定时间偏移（秒）。
    ///
    /// 文件源支持任意跳转；实时源应返回 `SeekError::NotSupported`。
    fn seek(&mut self, timestamp: f64) -> Result<(), SeekError>;

    /// 返回数据源的元数据。
    fn metadata(&self) -> &StreamMetadata;

    /// 当前进度（0.0 ~ 1.0）。
    ///
    /// 文件源返回已消费数据的比例；实时源因无法预知终点，返回 `None`。
    fn progress(&self) -> Option<f64>;
}