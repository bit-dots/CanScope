<p align="center">
  <img src="crates/canscope-app/icons/icon.png" alt="CanScope" width="128" />
</p>

<h1 align="center">CanScope</h1>

<p align="center">
  <strong>跨平台 CAN 总线离线回放分析工具</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/Rust-1.83%2B-orange" alt="Rust" />
</p>

---

## ✨ 特性

- 📂 **多格式支持** — 加载 ASC / CSV 格式的 CAN 日志文件，未来支持 BLF / TRC
- 🗂️ **DBC 信号解码** — 加载 DBC 数据库，自动解码信号值，支持 Intel / Motorola 字节序、多路复用、浮点信号、值表映射
- 🚀 **虚拟滚动** — 基于虚拟滚动的报文列表，10 万帧以上流畅浏览不失帧
- ▶️ **回放控制** — 播放 / 暂停 / 停止 / Seek 跳转 / 逐帧步进，像视频播放器一样回放 CAN 数据
- 🎨 **跨平台** — 同一套代码，Windows / macOS / Linux 原生体验
- 🔌 **零硬件依赖** — 首阶段纯离线分析，无需任何 CAN 硬件即可使用

## 🖼️ 截图

<!-- TODO: 添加应用截图 -->

## ⚙️ 环境要求

| 平台 | 最低版本 |
|------|:--:|
| Windows | 10 (x64) |
| macOS | 13 Ventura+ |
| Linux | Ubuntu 22.04+ |

前置依赖：

- [Rust](https://www.rust-lang.org/) 1.83+
- [Node.js](https://nodejs.org/) 18+
- （仅 Linux）`sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/your-org/CanScope.git
cd CanScope

# 安装前端依赖
cd frontend && npm install && cd ..

# 启动开发模式（Tauri + 前端热重载）
cargo tauri dev
```

## 📦 构建

```bash
# 编译 Rust workspace（7 crates）
cargo build --release

# 构建前端
cd frontend && npm run build && cd ..

# 运行全部测试
cargo test
```

## 🧱 架构

```
┌─────────────────────────────────────────┐
│              canscope-app                │
│         Tauri 桌面应用 + IPC 命令         │
├─────────────────────────────────────────┤
│  canscope-playback   │  canscope-export  │
│     回放引擎          │     格式导出       │
├─────────────────────────────────────────┤
│  canscope-dbc  │  canscope-parser        │
│  DBC 信号解码   │  ASC / CSV 解析         │
├─────────────────────────────────────────┤
│            canscope-core                 │
│    CanFrame / CanFrameStream trait       │
├─────────────────────────────────────────┤
│         canscope-adapter (Phase 3)       │
│      SocketCAN / PCAN 硬件接入层          │
└─────────────────────────────────────────┘
```

## 📂 项目结构

```
CanScope/
├── crates/
│   ├── canscope-core/       # 核心类型与 trait 定义
│   ├── canscope-parser/     # ASC / CSV 格式解析器
│   ├── canscope-dbc/        # DBC 解析 + 信号解码引擎
│   ├── canscope-playback/   # 回放引擎（播放 / 暂停 / 倍速 / Seek）
│   ├── canscope-export/     # 格式导出（ASC / CSV）
│   ├── canscope-adapter/    # 硬件接入层（Phase 3）
│   └── canscope-app/        # Tauri 应用 + 图标资源
├── frontend/                # SolidJS + TypeScript 前端
│   └── src/
│       └── components/      # Toolbar / FrameTable / StatusBar
├── docs/design/             # 需求与设计文档
└── Cargo.toml               # Rust workspace 配置
```

## 🗺️ 路线图

### Phase 1 — 离线回放分析（当前）

| 状态 | 功能 |
|:--:|------|
| ✅ | ASC 文件加载（标准帧 / 扩展帧 / 远程帧 / CAN FD） |
| ✅ | DBC 数据库加载与信号解码 |
| ✅ | 报文列表虚拟滚动（10 万+ 帧） |
| ✅ | 解码信号值实时显示 |
| ✅ | 回放引擎（播放 / 暂停 / 停止 / Seek / 步进） |
| 🚧 | CSV 文件加载 |
| 🚧 | 报文过滤（CAN ID / 时间范围） |
| 🚧 | DBC 信号树面板 |
| 🚧 | 信号曲线绘制 |
| 🚧 | 倍速播放 / 时间轴拖拽 |

### Phase 2 — 增强分析

- [ ] BLF / TRC 文件加载
- [ ] Trace 对比分析
- [ ] 统计面板（总线负载 / 报文频率）
- [ ] 书签 / 标记
- [ ] 多窗口 / 多面板

### Phase 3 — 实时与扩展

- [ ] SocketCAN / PCAN 实时接入
- [ ] 实时录制
- [ ] Graphic Panel（仪表盘）
- [ ] J1939 / CANopen 协议解析

## 🛠️ 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Tauri 2.x |
| 后端语言 | Rust |
| 前端框架 | SolidJS + TypeScript |
| 构建工具 | Vite |
| 协议解析 | nom |
| 图表 | uPlot / ECharts（计划） |

## 🤝 开发指南

```bash
# Rust — 编译单个 crate
cargo build -p canscope-dbc

# Rust — 运行单个 crate 的测试
cargo test -p canscope-dbc

# 前端 — 开发模式（独立于 Tauri，用于 UI 调试）
cd frontend && npm run dev

# 前端 — 类型检查
cd frontend && npx tsc --noEmit
```

### 代码风格

- Rust：`cargo fmt` + `cargo clippy`
- TypeScript：`tsc --noEmit`
- Commit：`feat(scope): 中文描述`

## 📄 许可证

[MIT](LICENSE)