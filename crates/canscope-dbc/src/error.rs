use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbcError {
    #[error("failed to read file '{path}': {source}")]
    FileRead {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("line {line}: invalid DBC syntax: '{text}'")]
    ParseError { line: usize, text: String },

    #[error("line {line}: invalid integer value: '{text}'")]
    InvalidInt { line: usize, text: String },

    #[error("line {line}: invalid float value: '{text}'")]
    InvalidFloat { line: usize, text: String },

    #[error("line {line}: invalid BO_ definition: '{text}'")]
    InvalidMessage { line: usize, text: String },

    #[error("line {line}: invalid SG_ definition: '{text}'")]
    InvalidSignal { line: usize, text: String },

    #[error("line {line}: SG_ defined without parent BO_: '{text}'")]
    OrphanSignal { line: usize, text: String },

    #[error("line {line}: invalid VAL_ definition: '{text}'")]
    InvalidValueDesc { line: usize, text: String },

    #[error("line {line}: invalid VAL_TABLE_ definition: '{text}'")]
    InvalidValueTable { line: usize, text: String },

    #[error("signal '{signal}' in message {msg_id}: decode error: {reason}")]
    DecodeError {
        msg_id: u32,
        signal: String,
        reason: String,
    },
}