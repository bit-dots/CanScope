use thiserror::Error;

#[derive(Debug, Error)]
pub enum PlaybackError {
    #[error("no data source loaded")]
    NoSource,

    #[error("seek error: {0}")]
    SeekError(String),

    #[error("playback has ended (at end of stream)")]
    EndOfStream,

    #[error("dbc decode error: {0}")]
    DecodeError(#[from] canscope_dbc::DbcError),
}