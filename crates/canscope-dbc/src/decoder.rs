use canscope_core::CanFrame;

use crate::error::DbcError;
use crate::types::{ByteOrder, Dbc, DbcMessage, DecodedSignal, SigValType, SigValueType};

impl Dbc {
    pub fn decode_frame(&self, frame: &CanFrame) -> Result<Vec<DecodedSignal>, DbcError> {
        let msg = match self.message_index.get(&frame.can_id) {
            Some(&idx) => &self.messages[idx],
            None => return Ok(Vec::new()),
        };

        decode_message(msg, frame)
    }

    pub fn get_message(&self, can_id: u32) -> Option<&DbcMessage> {
        self.message_index.get(&can_id).map(|&idx| &self.messages[idx])
    }
}

fn decode_message(msg: &DbcMessage, frame: &CanFrame) -> Result<Vec<DecodedSignal>, DbcError> {
    let mut result = Vec::with_capacity(msg.signals.len());

    let mux_val = resolve_multiplexor(msg, frame);

    for sig in &msg.signals {
        if !should_decode(&sig.multiplexer, mux_val) {
            continue;
        }

        let raw = extract_raw(frame, sig);

        let physical = raw_to_physical(raw, sig);

        let label = sig.value_descriptions.get(&(raw as u32)).cloned();

        result.push(DecodedSignal {
            name: sig.name.clone(),
            raw_value: raw,
            physical_value: physical,
            unit: sig.unit.clone(),
            label,
        });
    }

    Ok(result)
}

fn resolve_multiplexor(msg: &DbcMessage, frame: &CanFrame) -> Option<u32> {
    for sig in &msg.signals {
        if sig.multiplexer == crate::types::Multiplexer::Multiplexor {
            let raw = extract_raw(frame, sig);
            return Some(raw as u32);
        }
    }
    None
}

fn should_decode(mux: &crate::types::Multiplexer, mux_val: Option<u32>) -> bool {
    match mux {
        crate::types::Multiplexer::None | crate::types::Multiplexer::Multiplexor => true,
        crate::types::Multiplexer::Multiplexed(expected) => mux_val == Some(*expected),
    }
}

fn extract_raw(frame: &CanFrame, sig: &crate::types::DbcSignal) -> u64 {
    let bit_sequence = match sig.byte_order {
        ByteOrder::Motorola => motorola_bit_sequence(sig.start_bit as u32, sig.bit_length as u32),
        ByteOrder::Intel => intel_bit_sequence(sig.start_bit as u32, sig.bit_length as u32),
    };

    let bit_len = sig.bit_length as usize;
    let byte_len = (bit_len + 7) / 8;
    let mut signal_bytes = vec![0u8; byte_len];

    for (i, &(byte_idx, bit_idx)) in bit_sequence.iter().enumerate() {
        let bit_val = if byte_idx < frame.data.len() {
            (frame.data[byte_idx] >> bit_idx) & 1
        } else {
            0
        };
        let target_byte = i / 8;
        let target_bit = i % 8;
        signal_bytes[target_byte] |= bit_val << target_bit;
    }

    let raw = match sig.byte_order {
        ByteOrder::Motorola => {
            let remaining = if bit_len % 8 == 0 { 8 } else { bit_len % 8 };
            if signal_bytes.len() == 1 {
                (signal_bytes[0] as u64) & ((1u64 << remaining) - 1)
            } else {
                let last = signal_bytes.len() - 1;
                let mut raw: u64 = 0;
                for &b in &signal_bytes[..last] {
                    raw = (raw << 8) | b as u64;
                }
                let mask = (1u64 << remaining) - 1;
                raw = (raw << remaining) | (signal_bytes[last] as u64 & mask);
                raw
            }
        }
        ByteOrder::Intel => {
            let mut raw: u64 = 0;
            for (i, &b) in signal_bytes.iter().enumerate() {
                raw |= (b as u64) << (i * 8);
            }
            raw
        }
    };

    if sig.value_type == SigValueType::Signed {
        sign_extend(raw, sig.bit_length)
    } else {
        raw
    }
}

fn motorola_bit_sequence(start_bit: u32, length: u32) -> Vec<(usize, usize)> {
    let mut bits = Vec::with_capacity(length as usize);
    for i in 0..length {
        let bit_pos = start_bit + i;
        let byte_idx = (bit_pos / 8) as usize;
        let bit_idx = (bit_pos % 8) as usize;
        bits.push((byte_idx, bit_idx));
    }
    bits
}

fn intel_bit_sequence(start_bit: u32, length: u32) -> Vec<(usize, usize)> {
    let mut bits = Vec::with_capacity(length as usize);
    for i in 0..length {
        let byte_offset = i / 8;
        let bit_offset = i % 8;
        let bit_pos = start_bit + byte_offset * 8 + bit_offset;
        let byte_idx = (bit_pos / 8) as usize;
        let bit_idx = (bit_pos % 8) as usize;
        bits.push((byte_idx, bit_idx));
    }
    bits
}

fn sign_extend(raw: u64, bit_length: u8) -> u64 {
    let bit_len = bit_length as u32;
    if bit_len == 0 || bit_len >= 64 {
        return raw;
    }
    let sign_mask = 1u64 << (bit_len - 1);
    if raw & sign_mask != 0 {
        raw | (!0u64 << bit_len)
    } else {
        raw
    }
}

fn raw_to_physical(raw: u64, sig: &crate::types::DbcSignal) -> f64 {
    if sig.factor == 0.0 {
        return sig.offset;
    }

    match (sig.val_type, sig.value_type) {
        (Some(SigValType::Float32), _) => {
            f32::from_bits(raw as u32) as f64 * sig.factor + sig.offset
        }
        (Some(SigValType::Double64), _) => (raw as f64) * sig.factor + sig.offset,
        _ => {
            let base = match sig.value_type {
                SigValueType::Unsigned => raw as f64,
                SigValueType::Signed => raw as i64 as f64,
            };
            base * sig.factor + sig.offset
        }
    }
}

#[cfg(test)]
mod tests {
    use canscope_core::CanFrame;

    use crate::parser::parse_dbc;

    fn make_frame(can_id: u32, data: &[u8]) -> CanFrame {
        let mut frame_data = [0u8; 64];
        let len = data.len().min(64);
        frame_data[..len].copy_from_slice(&data[..len]);
        CanFrame {
            timestamp: 0.0,
            bus_id: 0,
            can_id,
            is_extended: false,
            is_remote: false,
            is_fd: false,
            dlc: len as u8,
            data: frame_data,
        }
    }

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
    fn decode_intel_unsigned() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 EngineData: 8 BCM
 SG_ EngineSpeed : 0|16@1+ (1,0) [0|65535] "rpm" IC
 SG_ EngineTemp : 16|8@1+ (1,-40) [-40|215] "degC" IC

"#;
        let path = write_temp_dbc("decode_intel", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let frame = make_frame(256, &[0x34, 0x12, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00]);
        let signals = dbc.decode_frame(&frame).unwrap();

        assert_eq!(signals.len(), 2);

        let speed = &signals[0];
        assert_eq!(speed.name, "EngineSpeed");
        assert_eq!(speed.raw_value, 0x1234);
        assert!((speed.physical_value - 4660.0).abs() < 0.01);
        assert_eq!(speed.unit, "rpm");

        let temp = &signals[1];
        assert_eq!(temp.name, "EngineTemp");
        assert_eq!(temp.raw_value, 0x64);
        assert!((temp.physical_value - 60.0).abs() < 0.01);
        assert_eq!(temp.unit, "degC");
    }

    #[test]
    fn decode_motorola_unsigned() {
        let dbc_content = r#"VERSION ""

BU_: ABS

BO_ 512 ABS_Data: 6 ABS
 SG_ WheelSpeed : 0|12@0+ (0.1,0) [0|409.5] "km/h" IC

"#;
        let path = write_temp_dbc("decode_motorola", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let frame = make_frame(512, &[0x80, 0x01, 0x00, 0x00, 0x00, 0x00]);
        let signals = dbc.decode_frame(&frame).unwrap();

        assert_eq!(signals.len(), 1);
        let ws = &signals[0];
        assert_eq!(ws.raw_value, 0x801);
        assert!((ws.physical_value - 204.9).abs() < 0.01);
    }

    #[test]
    fn decode_signed() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 Msg1: 8 BCM
 SG_ SignedVal : 0|8@1- (1,0) [-128|127] "" IC

"#;
        let path = write_temp_dbc("decode_signed", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let frame_neg = make_frame(256, &[0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        let signals = dbc.decode_frame(&frame_neg).unwrap();
        assert_eq!(signals[0].raw_value as i64, -1i64);
        assert!((signals[0].physical_value - -1.0).abs() < 0.01);

        let frame_pos = make_frame(256, &[0x2A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        let signals = dbc.decode_frame(&frame_pos).unwrap();
        assert_eq!(signals[0].raw_value, 42);
        assert!((signals[0].physical_value - 42.0).abs() < 0.01);
    }

    #[test]
    fn decode_unknown_id() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 Msg1: 8 BCM
 SG_ Val : 0|8@1+ (1,0) [0|255] "" IC

"#;
        let path = write_temp_dbc("decode_unknown", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let frame = make_frame(0x999, &[0x42]);
        let signals = dbc.decode_frame(&frame).unwrap();
        assert!(signals.is_empty());
    }

    #[test]
    fn decode_with_value_labels() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 Msg1: 1 BCM
 SG_ State : 0|2@1+ (1,0) [0|3] "" IC

VAL_ 256 State 0 "Off" 1 "On" 2 "Error" 3 "Reserved" ;

"#;
        let path = write_temp_dbc("decode_labels", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let frame = make_frame(256, &[0x02]);
        let signals = dbc.decode_frame(&frame).unwrap();

        assert_eq!(signals.len(), 1);
        assert_eq!(signals[0].raw_value, 2);
        assert_eq!(signals[0].label.as_deref(), Some("Error"));
    }

    #[test]
    fn decode_multiplexed() {
        let dbc_content = r#"VERSION ""

BU_: BCM

BO_ 256 MuxMsg: 8 BCM
 SG_ MuxSel M : 0|4@1+ (1,0) [0|15] "" IC
 SG_ ValA m0 : 4|8@1+ (1,0) [0|255] "" IC
 SG_ ValB m1 : 4|8@1+ (1,0) [0|255] "" IC

"#;
        let path = write_temp_dbc("decode_mux", dbc_content);
        let dbc = parse_dbc(&path).unwrap();

        let frame_mux0 = make_frame(256, &[0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        let signals = dbc.decode_frame(&frame_mux0).unwrap();
        let names: Vec<&str> = signals.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"MuxSel"));
        assert!(names.contains(&"ValA"));
        assert!(!names.contains(&"ValB"));
        assert_eq!(signals.iter().find(|s| s.name == "ValA").unwrap().raw_value, 0x03);

        let frame_mux1 = make_frame(256, &[0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        let signals = dbc.decode_frame(&frame_mux1).unwrap();
        let names: Vec<&str> = signals.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"ValB"));
        assert!(!names.contains(&"ValA"));
    }
}