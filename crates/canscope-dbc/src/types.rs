use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dbc {
    pub version: Option<String>,
    pub nodes: Vec<String>,
    pub messages: Vec<DbcMessage>,
    pub value_tables: BTreeMap<String, Vec<DbcValueEntry>>,
    pub signal_values: BTreeMap<String, BTreeMap<u32, Vec<DbcValueEntry>>>,
    pub comments: BTreeMap<DbcCommentTarget, String>,
    pub sig_valtype: BTreeMap<String, BTreeMap<u32, SigValType>>,
    #[serde(skip)]
    pub(crate) message_index: BTreeMap<u32, usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DbcMessage {
    pub can_id: u32,
    pub name: String,
    pub dlc: u8,
    pub sender: String,
    pub signals: Vec<DbcSignal>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DbcSignal {
    pub name: String,
    pub start_bit: u8,
    pub bit_length: u8,
    pub byte_order: ByteOrder,
    pub value_type: SigValueType,
    pub factor: f64,
    pub offset: f64,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub unit: String,
    pub receivers: Vec<String>,
    pub multiplexer: Multiplexer,
    pub comment: Option<String>,
    pub value_descriptions: BTreeMap<u32, String>,
    pub val_type: Option<SigValType>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ByteOrder {
    Motorola,
    Intel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SigValueType {
    Unsigned,
    Signed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Multiplexer {
    None,
    Multiplexor,
    Multiplexed(u32),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DbcValueEntry {
    pub value: u32,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum DbcCommentTarget {
    Node(String),
    Message(u32),
    Signal(u32, String),
    EnvVar(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SigValType {
    Integer,
    Float32,
    Double64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DecodedSignal {
    pub name: String,
    pub raw_value: u64,
    pub physical_value: f64,
    pub unit: String,
    pub label: Option<String>,
}