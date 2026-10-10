use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("failed to read file '{path}': {source}")]
    FileRead {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("line {line}: invalid header format: '{text}'")]
    InvalidHeader { line: usize, text: String },

    #[error("line {line}: invalid frame format: '{text}'")]
    InvalidFrame { line: usize, text: String },

    #[error("line {line}: unsupported format")]
    UnsupportedFormat { line: usize },

    #[error("seek error: {0}")]
    SeekError(String),
}