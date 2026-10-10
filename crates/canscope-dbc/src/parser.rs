use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use crate::error::DbcError;
use crate::types::{
    ByteOrder, Dbc, DbcCommentTarget, DbcMessage, DbcSignal, DbcValueEntry, Multiplexer,
    SigValType, SigValueType,
};

pub fn parse_dbc(path: impl AsRef<Path>) -> Result<Dbc, DbcError> {
    let path = path.as_ref();
    let file = File::open(path).map_err(|e| DbcError::FileRead {
        path: path.to_path_buf(),
        source: e,
    })?;
    let reader = BufReader::new(file);
    let lines: Vec<(usize, String)> = reader
        .lines()
        .enumerate()
        .map(|(i, l)| {
            l.map_err(|e| DbcError::FileRead {
                path: path.to_path_buf(),
                source: e,
            })
            .map(|s| (i + 1, s))
        })
        .collect::<Result<Vec<_>, DbcError>>()?;
    let lines: &[(usize, String)] = &lines;

    let mut dbc = Dbc {
        version: None,
        nodes: Vec::new(),
        messages: Vec::new(),
        value_tables: BTreeMap::new(),
        signal_values: BTreeMap::new(),
        comments: BTreeMap::new(),
        sig_valtype: BTreeMap::new(),
        message_index: BTreeMap::new(),
    };

    let mut current_msg: Option<&mut DbcMessage> = None;

    let mut idx = 0;
    while idx < lines.len() {
        let (line_num, ref line) = lines[idx];
        let trimmed = line.trim();

        if trimmed.is_empty() {
            idx += 1;
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("VERSION ") {
            dbc.version = Some(unquote(rest.trim()));
            idx += 1;
        } else if let Some(rest) = trimmed.strip_prefix("BU_:") {
            dbc.nodes = parse_nodes(rest.trim());
            idx += 1;
        } else if let Some(rest) = trimmed.strip_prefix("BO_ ") {
            let msg = parse_bo(rest.trim(), line_num)?;
            let can_id = msg.can_id;
            dbc.message_index.insert(can_id, dbc.messages.len());
            dbc.messages.push(msg);
            current_msg = dbc.messages.last_mut();
            idx += 1;
        } else if let Some(rest) = trimmed.strip_prefix("SG_ ") {
            let signal = parse_sg(rest.trim(), line_num)?;
            if let Some(ref mut msg) = current_msg {
                msg.signals.push(signal);
            } else {
                return Err(DbcError::OrphanSignal {
                    line: line_num,
                    text: trimmed.to_string(),
                });
            }
            idx += 1;
        } else if let Some(rest) = trimmed.strip_prefix("VAL_TABLE_ ") {
            let (name, entries) = parse_val_table(rest.trim(), line_num)?;
            dbc.value_tables.insert(name, entries);
            idx += 1;
        } else if let Some(rest) = trimmed.strip_prefix("VAL_ ") {
            let (msg_id, signal_name, entries) = parse_val(rest.trim(), line_num)?;
            dbc.signal_values
                .entry(signal_name)
                .or_default()
                .insert(msg_id, entries);
            idx += 1;
        } else if let Some(rest) = trimmed.strip_prefix("CM_ ") {
            let (target, text) = parse_cm(rest.trim(), line_num)?;
            dbc.comments.insert(target, text);
            idx += 1;
        } else if let Some(rest) = trimmed.strip_prefix("SIG_VALTYPE_ ") {
            let (msg_id, signal_name, valtype) = parse_sig_valtype(rest.trim(), line_num)?;
            dbc.sig_valtype
                .entry(signal_name)
                .or_default()
                .insert(msg_id, valtype);
            idx += 1;
        } else if trimmed.starts_with("BA_DEF_ ")
            || trimmed.starts_with("BA_ ")
            || trimmed.starts_with("BA_DEF_DEF_ ")
            || trimmed.starts_with("BS_:")
            || trimmed.starts_with("NS_ ")
            || trimmed.starts_with("EV_ ")
            || trimmed.starts_with("ENVVAR_DATA_ ")
            || trimmed.starts_with("SGTYPE_ ")
            || trimmed.starts_with("SGTYPE_VAL_ ")
            || trimmed.starts_with("SIGTYPE_VALTYPE_ ")
            || trimmed.starts_with("SIG_GROUP_ ")
        {
            idx += 1;
            continue;
        } else {
            idx += 1;
            continue;
        }
    }

    post_process(&mut dbc);

    Ok(dbc)
}

fn post_process(dbc: &mut Dbc) {
    for msg in &mut dbc.messages {
        if let Some(comment) = dbc
            .comments
            .get(&DbcCommentTarget::Message(msg.can_id))
        {
            msg.comment = Some(comment.clone());
        }

        for sig in &mut msg.signals {
            if let Some(comment) = dbc
                .comments
                .get(&DbcCommentTarget::Signal(msg.can_id, sig.name.clone()))
            {
                sig.comment = Some(comment.clone());
            }

            if let Some(values_by_msg) = dbc.signal_values.get(&sig.name) {
                if let Some(entries) = values_by_msg.get(&msg.can_id) {
                    for entry in entries {
                        sig.value_descriptions
                            .insert(entry.value, entry.label.clone());
                    }
                }
            }

            if let Some(vt_by_msg) = dbc.sig_valtype.get(&sig.name) {
                if let Some(vt) = vt_by_msg.get(&msg.can_id) {
                    sig.val_type = Some(*vt);
                }
            }
        }
    }
}

fn unquote(s: &str) -> String {
    s.trim_matches('"').to_string()
}

fn parse_nodes(s: &str) -> Vec<String> {
    s.split_whitespace().map(|n| n.to_string()).collect()
}

fn parse_bo(s: &str, line_num: usize) -> Result<DbcMessage, DbcError> {
    let err = || DbcError::InvalidMessage {
        line: line_num,
        text: s.to_string(),
    };

    let rest = s.strip_suffix(';').unwrap_or(s).trim();

    let (id_str, rest) = rest.split_once(' ').ok_or_else(err)?;
    let can_id = u32::from_str_radix(id_str, 10).map_err(|_| err())?;

    let (name, rest) = rest.split_once(':').ok_or_else(err)?;
    let name = name.trim().to_string();

    let parts: Vec<&str> = rest.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return Err(err());
    }

    let dlc: u8 = parts[0].parse().map_err(|_| err())?;
    let sender = parts[1].to_string();

    Ok(DbcMessage {
        can_id,
        name,
        dlc,
        sender,
        signals: Vec::new(),
        comment: None,
    })
}

fn parse_sg(s: &str, line_num: usize) -> Result<DbcSignal, DbcError> {
    let err = || DbcError::InvalidSignal {
        line: line_num,
        text: s.to_string(),
    };

    let rest = s.strip_suffix(';').unwrap_or(s).trim();

    let (left, right) = rest.split_once(':').ok_or_else(err)?;

    let name;
    let mut mux = Multiplexer::None;

    let left = left.trim();
    if let Some((first, second)) = left.split_once(' ') {
        if second.eq_ignore_ascii_case("M") {
            mux = Multiplexer::Multiplexor;
            name = first.to_string();
        } else if let Some(stripped) = second.strip_prefix('m') {
            if let Ok(val) = stripped.parse::<u32>() {
                mux = Multiplexer::Multiplexed(val);
                name = first.to_string();
            } else {
                name = left.to_string();
            }
        } else {
            name = left.to_string();
        }
    } else {
        name = left.to_string();
    }

    let right = right.trim();

    let (bit_part, rest) = right.split_once(' ').ok_or_else(err)?;

    let (start_bit_str, rest_part) = bit_part.split_once('|').ok_or_else(err)?;
    let start_bit: u8 = start_bit_str.parse().map_err(|_| err())?;

    let (len_str, rest_part) = rest_part.split_once('@').ok_or_else(err)?;
    let bit_length: u8 = len_str.parse().map_err(|_| err())?;

    let byte_order = if rest_part.starts_with('0') {
        ByteOrder::Motorola
    } else {
        ByteOrder::Intel
    };
    let value_type = if rest_part.ends_with('-') {
        SigValueType::Signed
    } else {
        SigValueType::Unsigned
    };

    let rest = rest.trim();

    let paren_start = rest.find('(').ok_or_else(err)?;
    let paren_end = rest.find(')').ok_or_else(err)?;
    let scale_offset_str = &rest[paren_start + 1..paren_end];

    let (factor_str, offset_str) = scale_offset_str.split_once(',').ok_or_else(err)?;
    let factor: f64 = factor_str.trim().parse().map_err(|_| err())?;
    let offset: f64 = offset_str.trim().parse().map_err(|_| err())?;

    let after_paren = rest[paren_end + 1..].trim();

    let (min, max, unit, receivers) = if let Some(bracket_start) = after_paren.find('[') {
        let bracket_end = after_paren.find(']').ok_or_else(err)?;
        let range_str = &after_paren[bracket_start + 1..bracket_end];
        let (min_str, max_str) = range_str.split_once('|').ok_or_else(err)?;

        let after_bracket = after_paren[bracket_end + 1..].trim();

        let (unit_str, receivers_str) = if let Some(quote_start) = after_bracket.find('"') {
            let quote_end = after_bracket[quote_start + 1..]
                .find('"')
                .ok_or_else(err)?;
            let unit = after_bracket[quote_start + 1..quote_start + 1 + quote_end].to_string();
            let after_unit = after_bracket[quote_start + 1 + quote_end + 1..].trim();
            (unit, after_unit)
        } else {
            (String::new(), after_bracket)
        };

        let min: f64 = min_str.trim().parse().map_err(|_| err())?;
        let max: f64 = max_str.trim().parse().map_err(|_| err())?;

        (Some(min), Some(max), unit_str, receivers_str)
    } else if let Some(quote_start) = after_paren.find('"') {
        let quote_end = after_paren[quote_start + 1..]
            .find('"')
            .ok_or_else(err)?;
        let unit = after_paren[quote_start + 1..quote_start + 1 + quote_end].to_string();
        let after_unit = after_paren[quote_start + 1 + quote_end + 1..].trim();
        (None, None, unit, after_unit)
    } else {
        (None, None, String::new(), after_paren)
    };

    let receivers: Vec<String> = receivers
        .split(',')
        .map(|r| r.trim().to_string())
        .filter(|r| !r.is_empty())
        .collect();

    Ok(DbcSignal {
        name,
        start_bit,
        bit_length,
        byte_order,
        value_type,
        factor,
        offset,
        min,
        max,
        unit,
        receivers,
        multiplexer: mux,
        comment: None,
        value_descriptions: BTreeMap::new(),
        val_type: None,
    })
}

fn parse_val_table(s: &str, line_num: usize) -> Result<(String, Vec<DbcValueEntry>), DbcError> {
    let err = || DbcError::InvalidValueTable {
        line: line_num,
        text: s.to_string(),
    };

    let s = s.strip_suffix(';').unwrap_or(s).trim();

    let (name, rest) = s.split_once(' ').ok_or_else(err)?;
    let name = name.trim().to_string();

    let entries = parse_value_pairs(rest.trim(), line_num)?;

    Ok((name, entries))
}

fn parse_val(
    s: &str,
    line_num: usize,
) -> Result<(u32, String, Vec<DbcValueEntry>), DbcError> {
    let err = || DbcError::InvalidValueDesc {
        line: line_num,
        text: s.to_string(),
    };

    let s = s.strip_suffix(';').unwrap_or(s).trim();

    let parts: Vec<&str> = s.splitn(3, ' ').collect();
    if parts.len() < 3 {
        return Err(err());
    }

    let msg_id: u32 = parts[0].parse().map_err(|_| err())?;
    let signal_name = parts[1].to_string();

    let entries = parse_value_pairs(parts[2].trim(), line_num)?;

    Ok((msg_id, signal_name, entries))
}

fn parse_value_pairs(s: &str, line_num: usize) -> Result<Vec<DbcValueEntry>, DbcError> {
    let err = || DbcError::ParseError {
        line: line_num,
        text: s.to_string(),
    };

    let mut entries = Vec::new();
    let mut remaining = s;

    while !remaining.is_empty() {
        let (val_str, rest1) = remaining.split_once(' ').ok_or_else(err)?;

        let val: u32 = val_str.parse().map_err(|_| err())?;

        remaining = rest1.trim_start();

        if !remaining.starts_with('"') {
            break;
        }

        let quote_end = remaining[1..].find('"').ok_or_else(err)?;
        let label = remaining[1..1 + quote_end].to_string();
        remaining = remaining[1 + quote_end + 1..].trim_start();

        entries.push(DbcValueEntry {
            value: val,
            label,
        });
    }

    Ok(entries)
}

fn parse_cm(s: &str, line_num: usize) -> Result<(DbcCommentTarget, String), DbcError> {
    let err = || DbcError::ParseError {
        line: line_num,
        text: s.to_string(),
    };

    let (target_str, rest) = s.split_once(' ').ok_or_else(err)?;
    let target_str = target_str.trim();

    let text_start = rest.find('"').ok_or_else(err)?;
    let text_end = rest[text_start + 1..].find('"').ok_or_else(err)?;
    let text = rest[text_start + 1..text_start + 1 + text_end].to_string();

    let identifier = rest[..text_start].trim().trim_end_matches(';');

    let target = if target_str.eq_ignore_ascii_case("BU_") {
        DbcCommentTarget::Node(identifier.to_string())
    } else if target_str.eq_ignore_ascii_case("BO_") {
        let msg_id: u32 = identifier.parse().map_err(|_| err())?;
        DbcCommentTarget::Message(msg_id)
    } else if target_str.eq_ignore_ascii_case("SG_") {
        let (msg_id_str, sig_name) = identifier.split_once(' ').ok_or_else(err)?;
        let msg_id: u32 = msg_id_str.parse().map_err(|_| err())?;
        DbcCommentTarget::Signal(msg_id, sig_name.to_string())
    } else if target_str.eq_ignore_ascii_case("EV_") {
        DbcCommentTarget::EnvVar(identifier.to_string())
    } else {
        DbcCommentTarget::Node(identifier.to_string())
    };

    Ok((target, text))
}

fn parse_sig_valtype(
    s: &str,
    line_num: usize,
) -> Result<(u32, String, SigValType), DbcError> {
    let err = || DbcError::ParseError {
        line: line_num,
        text: s.to_string(),
    };

    let s = s.strip_suffix(';').unwrap_or(s).trim();
    let parts: Vec<&str> = s.splitn(3, ' ').collect();
    if parts.len() < 3 {
        return Err(err());
    }

    let msg_id: u32 = parts[0].parse().map_err(|_| err())?;
    let signal_name = parts[1].to_string();
    let valtype_num: u32 = parts[2].parse().map_err(|_| err())?;

    let valtype = match valtype_num {
        0 => SigValType::Integer,
        1 => SigValType::Float32,
        2 => SigValType::Double64,
        _ => return Err(err()),
    };

    Ok((msg_id, signal_name, valtype))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_temp_dbc(name: &str, content: &str) -> String {
        let dir = std::env::temp_dir();
        let path = dir.join(format!(
            "canscope_test_{}_{}.dbc",
            std::process::id(),
            name
        ));
        std::fs::write(&path, content).unwrap();
        path.to_string_lossy().to_string()
    }

    #[test]
    fn parse_simple_dbc() {
        let dbc_content = r#"VERSION ""

BU_: BCM IC ABS

BO_ 256 EngineData: 8 BCM
 SG_ EngineSpeed : 0|16@1+ (1,0) [0|65535] "rpm" IC
 SG_ EngineTemp : 16|8@1+ (1,-40) [-40|215] "degC" IC

BO_ 512 ABS_Data: 6 ABS
 SG_ WheelSpeedFR : 0|12@0+ (0.1,0) [0|409.5] "km/h" IC,BCM
 SG_ WheelSpeedFL : 12|12@0+ (0.1,0) [0|409.5] "km/h" IC

"#;

        let path = write_temp_dbc("simple", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        assert_eq!(dbc.nodes.len(), 3);
        assert_eq!(dbc.nodes, vec!["BCM", "IC", "ABS"]);
        assert_eq!(dbc.messages.len(), 2);

        let msg0 = &dbc.messages[0];
        assert_eq!(msg0.can_id, 256);
        assert_eq!(msg0.name, "EngineData");
        assert_eq!(msg0.dlc, 8);
        assert_eq!(msg0.sender, "BCM");
        assert_eq!(msg0.signals.len(), 2);

        let sig0 = &msg0.signals[0];
        assert_eq!(sig0.name, "EngineSpeed");
        assert_eq!(sig0.start_bit, 0);
        assert_eq!(sig0.bit_length, 16);
        assert_eq!(sig0.byte_order, ByteOrder::Intel);
        assert_eq!(sig0.value_type, SigValueType::Unsigned);
        assert_eq!(sig0.factor, 1.0);
        assert_eq!(sig0.offset, 0.0);
        assert_eq!(sig0.unit, "rpm");
        assert_eq!(sig0.receivers, vec!["IC"]);

        let sig1 = &msg0.signals[1];
        assert_eq!(sig1.name, "EngineTemp");
        assert_eq!(sig1.start_bit, 16);
        assert_eq!(sig1.offset, -40.0);

        let msg1 = &dbc.messages[1];
        assert_eq!(msg1.can_id, 512);
        assert_eq!(msg1.signals[0].factor, 0.1);
    }

    #[test]
    fn parse_value_table() {
        let dbc_content = r#"VERSION ""

BU_: BCM

VAL_TABLE_ ErrorCode 0 "NoError" 1 "Timeout" 2 "CRCError" ;

BO_ 256 Msg1: 4 BCM
 SG_ Error : 0|8@1+ (1,0) [0|255] "" BCM

VAL_ 256 Error 0 "NoError" 1 "Timeout" 2 "CRCError" ;

"#;

        let path = write_temp_dbc("val_table", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        assert_eq!(dbc.value_tables.len(), 1);
        let vt = dbc.value_tables.get("ErrorCode").unwrap();
        assert_eq!(vt.len(), 3);
        assert_eq!(vt[0].value, 0);
        assert_eq!(vt[0].label, "NoError");

        let sig = &dbc.messages[0].signals[0];
        assert_eq!(sig.value_descriptions.len(), 3);
        assert_eq!(
            sig.value_descriptions.get(&0).map(|s| s.as_str()),
            Some("NoError")
        );
    }

    #[test]
    fn parse_comments() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 Msg1: 4 BCM
 SG_ Val : 0|8@1+ (1,0) [0|255] "" BCM

CM_ BU_ BCM "Body Control Module";
CM_ BO_ 256 "Engine data message";
CM_ SG_ 256 Val "Vehicle value signal";

"#;

        let path = write_temp_dbc("comments", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let msg = &dbc.messages[0];
        assert_eq!(msg.comment.as_deref(), Some("Engine data message"));

        let sig = &msg.signals[0];
        assert_eq!(sig.comment.as_deref(), Some("Vehicle value signal"));
    }

    #[test]
    fn parse_signed_motorola() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 Msg1: 8 BCM
 SG_ Voltage : 32|16@0- (0.001,-10) [-10|55.535] "V" IC

"#;

        let path = write_temp_dbc("signed_motorola", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let sig = &dbc.messages[0].signals[0];
        assert_eq!(sig.byte_order, ByteOrder::Motorola);
        assert_eq!(sig.value_type, SigValueType::Signed);
        assert_eq!(sig.factor, 0.001);
        assert_eq!(sig.offset, -10.0);
    }

    #[test]
    fn parse_multiplexed() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 MuxMsg: 8 BCM
 SG_ MuxSel M : 0|4@1+ (1,0) [0|15] "" IC
 SG_ ValA m0 : 4|12@1+ (1,0) [0|4095] "" IC
 SG_ ValB m1 : 4|12@1+ (1,0) [0|4095] "" IC

"#;

        let path = write_temp_dbc("mux", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let msg = &dbc.messages[0];
        assert_eq!(msg.signals.len(), 3);

        assert_eq!(msg.signals[0].multiplexer, Multiplexer::Multiplexor);
        assert_eq!(msg.signals[1].multiplexer, Multiplexer::Multiplexed(0));
        assert_eq!(msg.signals[2].multiplexer, Multiplexer::Multiplexed(1));
    }
}