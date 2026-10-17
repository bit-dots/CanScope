#!/usr/bin/env python3
"""Generate a 5-minute ASC trace for CanScope playback testing."""
import math

SECS = 300  # 5 minutes

def to_hex(val, signed=False):
    if signed:
        val = val & 0xFFFF
    hi = (val >> 8) & 0xFF
    lo = val & 0xFF
    return f"{hi:02X} {lo:02X}"

lines = []
lines.append("date Sun Oct 17 14:30:00.000 2026")
lines.append("// ============================================================================")
lines.append("// CANscope 5-minute sample trace — ~240 frames, 2 channels")
lines.append("// Total span: 0.0s ~ 300.0s (5 min)")
lines.append("//")
lines.append("// Messages:")
lines.append("//   EngineData     (0x100, Ch1): EngineSpeed [rpm], CoolantTemp [degC], 10s cycle")
lines.append("//   SteeringInfo   (0x200, Ch2): SteeringAngle [deg], SteeringTorque [Nm], 2s cycle")
lines.append("//   VehicleDynamics(0x350, Ch1, ext): Speed [km/h], BrakePressure [%], 5s cycle")
lines.append("// ============================================================================")
lines.append("")
lines.append("Begin Triggerblock TestDrive5Min")
lines.append("")

# --- EngineData: Ch1, 0x100, every 10s ---
for t in range(0, SECS + 1, 10):
    # RPM: sine wave 800-3500 over 5 min
    rpm = int(2000 + 1500 * math.sin(t / 60 * math.pi))
    # Coolant: ramps up 20 -> 95 over 5 min
    temp = int(20 + 75 * (t / SECS))
    lines.append(f"{t:.6f} 1 100 Rx d 8 {to_hex(rpm)} {to_hex(temp)} 00 00 00 00 "
                 f"; Speed={rpm}rpm Temp={temp}degC")

lines.append("")

# --- VehicleDynamics: Ch1, 0x350 extended, every 5s ---
for t in range(0, SECS + 1, 5):
    # Speed: 0 -> 120 km/h over 5 min
    speed_kmh = int(120 * (t / SECS))
    # Brake: pulsing pattern
    brake_pct = int(abs(30 * math.sin(t / 15 * math.pi)))
    # Brake switch: on during braking phases
    switch = 0x08 if brake_pct > 5 else 0x00
    speed_raw = speed_kmh * 20  # 0.05 km/h per bit
    lines.append(f"{t:.6f} 1 350x Rx d 8 {to_hex(speed_raw)} {to_hex(brake_pct)} 00 "
                 f"{switch:02X} 00 00 00 00 "
                 f"; Speed={speed_kmh}km/h Brake={brake_pct}% Switch={'On' if switch else 'Off'}")

lines.append("")

# --- SteeringInfo: Ch2, 0x200, every 2s ---
for t in range(0, SECS + 1, 2):
    # Angle: oscillating -30 to +30 degrees
    angle = int(30 * math.sin(t / 12 * math.pi))
    # Torque: responds to angle
    torque_val = int(abs(angle) * 0.15 * 10)  # 0.1 Nm per bit
    angle_raw = angle * 10  # 0.1 deg per bit, signed
    lines.append(f"{t:.6f} 2 200 Rx d 8 {to_hex(angle_raw, signed=True)} "
                 f"{to_hex(torque_val)} 00 00 00 00 00 00 "
                 f"; Angle={angle:.1f}deg Torque={torque_val/10:.1f}Nm")

lines.append("")
lines.append("End Triggerblock")

with open("sample_trace_5min.asc", "w") as f:
    f.write("\n".join(lines) + "\n")

print("Generated sample_trace_5min.asc")
print(f"  Frames: {len([l for l in lines if l and not l.startswith(('//','date','Begin','End',''))])}")
print(f"  Span:   0.0s ~ {SECS}.0s")