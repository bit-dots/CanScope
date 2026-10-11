<p align="center">
  <img src="crates/canscope-app/icons/icon.png" alt="CanScope" width="128" />
</p>

<h1 align="center">CanScope</h1>

<p align="center">
  <strong>A Cross-Platform CAN Bus Offline Playback &amp; Analysis Tool</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/Rust-1.83%2B-orange" alt="Rust" />
</p>

---

## ✨ Features

- 📂 **Multi-format Support** — Load CAN log files in ASC / CSV format, with BLF / TRC planned
- 🗂️ **DBC Signal Decoding** — Load DBC databases and decode signal values automatically; supports Intel / Motorola byte order, multiplexed signals, floating-point signals, and value table mapping
- 🚀 **Virtual Scrolling** — Browse 100k+ frames smoothly with virtual scrolling at 60 fps
- ▶️ **Playback Control** — Play / Pause / Stop / Seek / Frame stepping — replay CAN data like a video player
- 🎨 **Cross-Platform** — One codebase, native experience on Windows / macOS / Linux
- 🔌 **Zero Hardware Dependency** — Phase 1 is purely offline analysis; no CAN hardware required

## 🖼️ Screenshots

<!-- TODO: add application screenshots -->

## ⚙️ Requirements

| Platform | Minimum Version |
|----------|:--:|
| Windows  | 10 (x64) |
| macOS    | 13 Ventura+ |
| Linux    | Ubuntu 22.04+ |

Prerequisites:

- [Rust](https://www.rust-lang.org/) 1.83+
- [Node.js](https://nodejs.org/) 18+
- (Linux only) `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/CanScope.git
cd CanScope

# Install frontend dependencies
cd frontend && npm install && cd ..

# Start development mode (Tauri + frontend hot-reload)
cargo tauri dev
```

## 📦 Build

```bash
# Build the Rust workspace (7 crates)
cargo build --release

# Build the frontend
cd frontend && npm run build && cd ..

# Run all tests
cargo test
```

## 🧱 Architecture

```
┌─────────────────────────────────────────┐
│              canscope-app                │
│        Tauri Desktop App + IPC Commands  │
├─────────────────────────────────────────┤
│  canscope-playback   │  canscope-export  │
│   Playback Engine     │  Format Export   │
├─────────────────────────────────────────┤
│  canscope-dbc  │  canscope-parser        │
│  DBC Decoder   │  ASC / CSV Parser       │
├─────────────────────────────────────────┤
│            canscope-core                 │
│    CanFrame / CanFrameStream trait       │
├─────────────────────────────────────────┤
│        canscope-adapter (Phase 3)        │
│   SocketCAN / PCAN Hardware Abstraction  │
└─────────────────────────────────────────┘
```

## 📂 Project Structure

```
CanScope/
├── crates/
│   ├── canscope-core/       # Core types & CanFrameStream trait
│   ├── canscope-parser/     # ASC / CSV format parsers
│   ├── canscope-dbc/        # DBC parser & signal decoder engine
│   ├── canscope-playback/   # Playback engine (play / pause / speed / seek)
│   ├── canscope-export/     # Format export (ASC / CSV)
│   ├── canscope-adapter/    # Hardware abstraction layer (Phase 3)
│   └── canscope-app/        # Tauri application + icon assets
├── frontend/                # SolidJS + TypeScript frontend
│   └── src/
│       └── components/      # Toolbar / FrameTable / StatusBar
├── docs/design/             # Requirements & design documents
└── Cargo.toml               # Rust workspace configuration
```

## 🗺️ Roadmap

### Phase 1 — Offline Playback &amp; Analysis (current)

| Status | Feature |
|:--:|------|
| ✅ | ASC file loading (standard / extended / remote / CAN FD frames) |
| ✅ | DBC database loading & signal decoding |
| ✅ | Virtual-scrolling frame table (100k+ frames) |
| ✅ | Real-time decoded signal display |
| ✅ | Playback engine (play / pause / stop / seek / frame stepping) |
| 🚧 | CSV file loading |
| 🚧 | Frame filtering (CAN ID / time range) |
| 🚧 | DBC signal tree panel |
| 🚧 | Signal curve plotting |
| 🚧 | Speed control / timeline scrubbing |

### Phase 2 — Advanced Analysis

- [ ] BLF / TRC file loading
- [ ] Trace comparison &amp; diff analysis
- [ ] Statistics panel (bus load / message frequency)
- [ ] Bookmarks / annotations
- [ ] Multi-window / multi-panel support

### Phase 3 — Real-time &amp; Extensions

- [ ] SocketCAN / PCAN real-time capture
- [ ] Real-time recording
- [ ] Graphic Panel (custom dashboards)
- [ ] J1939 / CANopen protocol decoding

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Tauri 2.x |
| Backend Language | Rust |
| Frontend Framework | SolidJS + TypeScript |
| Build Tool | Vite |
| Protocol Parsing | nom |
| Charts | uPlot / ECharts (planned) |

## 🤝 Development

```bash
# Rust — build a single crate
cargo build -p canscope-dbc

# Rust — run tests for a single crate
cargo test -p canscope-dbc

# Frontend — dev mode (standalone, for UI debugging)
cd frontend && npm run dev

# Frontend — type check
cd frontend && npx tsc --noEmit
```

### Code Style

- Rust: `cargo fmt` + `cargo clippy`
- TypeScript: `tsc --noEmit`
- Commit: `feat(scope): description`

## 📄 License

[MIT](LICENSE)