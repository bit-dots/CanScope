# CanScope — 跨平台 CAN 分析工具 概念设计

## 1. 项目背景

### 1.1 问题域

当前 CAN 总线分析工具生态高度集中于 Windows 平台（CANoe、CANalyzer、PCAN-View、BUSMASTER 等），
跨平台（Linux/macOS）且体验良好的工具极为匮乏。嵌入式开发和汽车电子领域对跨平台的 CAN 离线分析与回放工具有真实需求。

### 1.2 项目目标

开发一款**跨平台、高性能、体验流畅**的 CAN 总线分析工具，首阶段聚焦**离线报文回放与信号分析**，
后期可扩展为支持实时硬件接入的全功能工具。

### 1.3 核心设计原则

- **性能优先**：大文件加载、信号解码、UI 渲染均不能出现卡顿
- **跨平台**：Windows、Linux、macOS 统一体验
- **可扩展**：架构预留硬件接入扩展点，后期接入无需重构核心
- **离线优先**：Phase 1 不依赖任何 CAN 硬件，纯文件驱动

---

## 2. 可行性分析

### 2.1 市场可行性

| 维度 | 评估 |
|------|------|
| 目标用户 | 嵌入式开发者、汽车电子工程师、CAN 总线调试人员 |
| 竞品现状 | SavvyCAN (Qt 跨平台)、CANdevStudio (Qt 跨平台) — 存在但各有短板 |
| 差异化空间 | 极致的性能表现、现代化的 UI/UX、插件扩展机制、原生单文件分发 |
| 开闭源策略 | 暂不限定，可考虑开源以建立社区 |

### 2.2 技术可行性

| 维度 | 评估 |
|------|------|
| 文件格式解析 | ASC/CSV 文本格式解析成熟；BLF/MDF 有公开格式文档 |
| DBC 信号解码 | 计算密集型任务，Rust 天然适合 |
| 跨平台 GUI | Tauri + Web 前端方案在工控类桌面应用已有验证案例 |
| 性能目标 | Rust 在文件 I/O、数据计算、内存管理方面均能达到预期 |
| 硬件扩展（后期） | SocketCAN (Linux)、PCAN (Win/Linux) 可通过 FFI 接入 |

### 2.3 关键风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Tauri IPC 高频数据传输压力 | 中 | 批量传输 + 帧采样，每 16ms 推送一批 |
| BLF/MDF 格式解析复杂度高 | 中 | 放到 Phase 2，优先完成文本格式 |
| 单人开发战线长 | 中 | 严格分阶段交付，每阶段有可演示产出 |
| macOS 生态不成熟 | 低 | Phase 1 优先支持 Win/Linux，macOS 后续适配 |

---

## 3. 技术选型

### 3.1 总体方案

| 层次 | 选型 | 说明 |
|------|------|------|
| 编程语言 | **Rust** | 零成本抽象、无 GC、编译为单文件二进制 |
| 桌面框架 | **Tauri 2.x** | 轻量跨平台 Shell，Rust 后端 + Web 前端 |
| 前端框架 | **SolidJS** | 极致性能的响应式 UI 框架 |
| 图表库 | **uPlot / ECharts** | WebGL 加速的实时图表渲染 |
| 样式方案 | **TailwindCSS** | 原子化 CSS，开发效率高 |

### 3.2 Rust Crate 选型

| 用途 | Crate | 说明 |
|------|-------|------|
| 文本解析 | `nom` | 解析器组合子，ASC/CSV/TRC 格式解析 |
| 二进制解析 | `nom` / `binread` | BLF 格式解析 |
| 异步运行时 | `tokio` | 回放引擎、IPC 通信 |
| 并发通道 | `crossbeam` | 零锁 SPSC ring buffer |
| 并行计算 | `rayon` | 批量信号解码并行化 |
| 序列化 | `serde` + `serde_json` | Tauri IPC 数据序列化 |
| 时间处理 | `chrono` | 时间戳处理与格式转换 |
| 错误处理 | `thiserror` + `anyhow` | 分层错误类型定义 |

### 3.3 方案对比（Rust vs Python）

| 维度 | Rust + Tauri | Python + Qt | 差距 |
|------|-------------|-------------|------|
| 大文件加载 (1GB ASC) | 1-3s | 30-60s | 10-60x |
| DBC 信号解码 (10万帧) | 50-200ms | 2-5s | 10-25x |
| 内存占用 | 100-300MB | 500MB-2GB | 3-6x |
| 打包体积 | 15-30MB | 100MB+ | 3-5x |
| 启动速度 | 0.3-0.5s | 1-3s | 3-6x |
| 开发效率 | 中 | 高 | — |

---

## 4. 架构设计

### 4.1 分层架构

```
┌──────────────────────────────────────────────────────┐
│                   Tauri 2.x Shell                     │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              Web 前端 (SolidJS)                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │  │
│  │  │ 报文列表  │ │ 信号曲线  │ │ 回放控制栏    │   │  │
│  │  │(虚拟滚动) │ │(WebGL)   │ │              │   │  │
│  │  └──────────┘ └──────────┘ └──────────────┘   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │  │
│  │  │ DBC 树   │ │ 时间轴    │ │ 统计面板      │   │  │
│  │  └──────────┘ └──────────┘ └──────────────┘   │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │ Tauri IPC (JSON/Binary)       │
│  ┌────────────────────▼───────────────────────────┐  │
│  │                 Rust Backend                    │  │
│  │                                                │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │           Playback Engine                 │  │  │
│  │  │  (播放/暂停/倍速/Seek/循环/步进)           │  │  │
│  │  └──────────────────┬───────────────────────┘  │  │
│  │                     │                          │  │
│  │  ┌──────────────────▼───────────────────────┐  │  │
│  │  │              DBC Engine                   │  │  │
│  │  │  (解析器 + 信号解码 + Multiplexing)        │  │  │
│  │  └──────────────────┬───────────────────────┘  │  │
│  │                     │                          │  │
│  │  ┌──────────────────▼───────────────────────┐  │  │
│  │  │         CanFrameStream (Trait)            │  │  │
│  │  │  ┌─────────────┐  ┌──────────────────┐   │  │  │
│  │  │  │ FileSource  │  │  LiveSource      │   │  │  │
│  │  │  │ (Phase 1)   │  │  (Phase 3)       │   │  │  │
│  │  │  │ ├─ ASC      │  │  ├─ SocketCAN    │   │  │  │
│  │  │  │ ├─ CSV      │  │  ├─ PCAN         │   │  │  │
│  │  │  │ ├─ BLF (P2) │  │  └─ ...          │   │  │  │
│  │  │  │ └─ MDF (P3) │  │                  │   │  │  │
│  │  │  └─────────────┘  └──────────────────┘   │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │          Export / Convert                 │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 4.2 核心抽象：CanFrameStream Trait

这是整个架构的**关键设计决策**——通过统一的 Trait 抽象数据源，
使 Phase 1 的文件源和 Phase 3 的实时硬件源对上层完全透明。

```rust
/// 统一的 CAN 帧结构
pub struct CanFrame {
    pub timestamp: f64,        // 秒，相对于 trace 起始
    pub bus_id: u8,            // 通道号
    pub can_id: u32,           // CAN ID
    pub is_extended: bool,     // 扩展帧 / 标准帧
    pub is_remote: bool,       // 远程帧
    pub is_fd: bool,           // CAN FD
    pub dlc: u8,               // 数据长度
    pub data: [u8; 64],        // 数据（CAN FD 最长 64 字节）
}

/// 数据源元数据
pub struct StreamMetadata {
    pub bus_count: u8,
    pub start_time: Option<DateTime<Utc>>,
    pub total_frames: Option<u64>,       // 文件模式：已知；实时模式：None
    pub duration: Option<f64>,           // 文件模式：已知；实时模式：None
    pub source_type: SourceType,
}

pub enum SourceType {
    File { path: PathBuf, format: FileFormat },
    Live { adapter: String },
}

/// 核心抽象 Trait：统一文件源和实时源
pub trait CanFrameStream: Send + Sync {
    /// 获取下一帧，返回 None 表示流已结束
    fn next(&mut self) -> Option<CanFrame>;

    /// Seek 到指定时间偏移（秒）。实时源返回错误。
    fn seek(&mut self, timestamp: f64) -> Result<(), SeekError>;

    /// 流元数据
    fn metadata(&self) -> &StreamMetadata;

    /// 当前进度（0.0 ~ 1.0），实时源返回 None
    fn progress(&self) -> Option<f64>;
}
```

**设计意图**：

| 差异点 | FileSource (Phase 1) | LiveSource (Phase 3) | 上层影响 |
|--------|---------------------|----------------------|----------|
| 是否有终点 | 有（文件末尾） | 无（持续接收） | `next()` 返回 `Option`，语义统一 |
| 是否可 Seek | 可 | 不可 | Trait 有 `seek()`，LiveSource 返回 Error |
| 时间戳来源 | 文件中记录 | 接收时系统时间 | 统一为 `f64`，对上层透明 |
| 进度是否可知 | 可知 | 不可知 | `progress()` 返回 `Option` |

### 4.3 数据流

```
[ASC/CSV/BLF 文件]
        │
        ▼
[FileSource: CanFrameStream 实现]
        │  CanFrame (raw)
        ▼
[DBC Engine]
        │  CanFrame + DecodedSignals
        ▼
[Playback Engine]
        │  按时间节奏批量输出
        ▼
[Tauri IPC → 前端]
        │
        ├──▶ 报文列表面板（虚拟滚动渲染）
        └──▶ 信号曲线面板（WebGL 实时绘制）
```

---

## 5. 模块划分

### 5.1 模块清单

| 模块 | 职责 | Phase |
|------|------|-------|
| `canscope-core` | CanFrame、CanFrameStream Trait、StreamMetadata 等核心类型 | P1 |
| `canscope-parser` | ASC/CSV/BLF/TRC 文件格式解析器 | P1 |
| `canscope-dbc` | DBC 文件解析、信号解码引擎 | P1 |
| `canscope-playback` | 回放控制引擎（播放/暂停/倍速/Seek/循环） | P1 |
| `canscope-export` | 数据导出与格式转换 | P1 |
| `canscope-app` | Tauri 桌面应用入口，IPC 命令调度，前后端桥接 | P1 |
| `canscope-adapter` | 实时硬件适配器（SocketCAN、PCAN 等） | P3 |

### 5.2 Cargo Workspace 结构（草案）

```
canscope/
├── crates/                     # Rust 工作区（Cargo workspace）
│   ├── canscope-core/          # 核心类型与 Trait（CanFrame、CanFrameStream）
│   ├── canscope-parser/        # 文件格式解析（ASC/CSV/BLF/TRC）
│   ├── canscope-dbc/           # DBC 解析与信号解码引擎
│   ├── canscope-playback/      # 回放控制引擎
│   ├── canscope-export/        # 数据导出与格式转换
│   ├── canscope-adapter/       # 硬件适配器（P3：SocketCAN、PCAN 等）
│   └── canscope-app/           # Tauri 桌面应用入口（IPC 调度、菜单、窗口管理）
├── frontend/                   # Web 前端（独立 JS 生态）
│   ├── src/                    # SolidJS 组件、stores、hooks
│   └── public/                 # 静态资源
├── docs/                       # 项目文档
│   └── design/                 # 方案设计文档
├── tests/                      # 跨 crate 集成测试
│   └── integration/            # 端到端测试用例
└── Cargo.toml                  # workspace 根配置（members + [workspace.dependencies]）
```

---

## 6. 支撑性模块设计

### 6.1 错误处理

Rust 项目的错误处理需要从概念阶段就明确策略，否则后期重构成本极高。建议采用"库用 `thiserror`、应用层用 `anyhow`"的分层策略：

```
crates (库)                         app (应用层)
─────────────                       ────────────
thiserror::Error                    anyhow::Result
├─ ParseError                      IPC handler 中:
├─ DbcError                        库返回的 Error → anyhow::Error → 前端错误提示
├─ PlaybackError
└─ ExportError

每个 crate 定义自己的 Error enum，实现 std::error::Error
```

### 6.2 日志与诊断

| 需求 | 方案 |
|------|------|
| Rust 后端日志 | `tracing` + `tracing-subscriber`（结构化日志） |
| 前端日志 | Console API（开发）/ 通过 IPC 回传 Rust 写入文件（生产） |
| DBC 解析警告 | 不阻断流程，累积 warning 列表通过 IPC 传给前端展示 |

### 6.3 配置管理

| 配置项 | 存储方式 |
|--------|----------|
| 最近打开的文件列表 | Tauri app data dir (跨平台自动路径) |
| 窗口布局/面板配置 | JSON 文件持久化 |
| DBC 文件关联 | 项目级配置 |
| 回放偏好设置 | 用户级配置 |

### 6.4 测试策略

| 测试层级 | 覆盖范围 | 工具 |
|----------|----------|------|
| 单元测试 | 解析器边界、DBC 解码正确性、回放逻辑 | `cargo test` |
| 集成测试 | 文件加载→解码→回放 端到端 | `cargo test --test integration` |
| 前端测试 | SolidJS 组件 | Vitest |
| 端到端测试 | Tauri 完整流程 | Tauri e2e (WebDriver) |
| 性能测试 | 大文件加载、高频解码基准 | `criterion` benchmark |

---

## 7. 分阶段路线图

### Phase 1 — 离线回放分析（MVP，2-3个月）

```
目标：加载 CAN 日志文件 + DBC，回放并可视化报文和信号

✅ 工程框架搭建（Tauri + Cargo workspace + SolidJS）
✅ CanFrameStream Trait 定义
✅ ASC / CSV 文件解析
✅ DBC 文件解析 + 信号解码引擎
✅ 回放控制引擎（播放/暂停/倍速/时间轴拖拽/步进）
✅ 报文列表面板（虚拟滚动 + DBC 信号实时解码显示）
✅ 信号曲线面板（选中信号跟随回放）
✅ 打包为独立可执行文件（Win/Linux/macOS）
```

### Phase 2 — 增强分析（+2个月）

```
目标：多格式支持 + 高级分析功能

△ BLF 二进制格式解析
△ Trace 对比分析（加载两份 trace，时间轴对齐，差异高亮）
△ 高级过滤与搜索
△ 统计面板（报文频率、总线负载、错误帧统计）
△ 导出功能（时间裁剪、格式转换）
```

### Phase 3 — 实时与扩展（+2个月）

```
目标：实时硬件接入 + 高级可视化

△ CanFrameStream LiveSource 实现
△ SocketCAN 适配器接入（Linux）
△ PCAN 适配器接入（Windows）
△ 实时监控模式 + 录制
△ Graphic Panel（仪表盘、信号灯等自定义控件）
△ 插件系统（自定义信号处理与可视化脚本）
△ J1939 / CANopen 高层协议支持
```

---

## 8. 设计决策记录

| ID | 决策 | 理由 | 日期 |
|----|------|------|------|
| D-001 | 采用 Rust 而非 Python | 离线分析场景下，性能差距达 10-60x，且打包分发优势明显 | 2026-10-10 |
| D-002 | 采用 Tauri 而非纯 Rust GUI (egui/iced) | Web 前端做复杂 UI 效率更高，虚拟滚动/WebGL 图表生态成熟 | 2026-10-10 |
| D-003 | 采用 SolidJS 而非 React/Vue | 编译时响应式，无虚拟 DOM 开销，适合高频数据更新场景 | 2026-10-10 |
| D-004 | CanFrameStream Trait 统一文件源和实时源 | 实现数据源与上层逻辑解耦，Phase 3 加硬件接入无需重构核心 | 2026-10-10 |
| D-005 | Phase 1 不接入任何 CAN 硬件 | 硬件 FFI 绑定工作量大，离线场景可独立交付价值，分散风险 | 2026-10-10 |

---

## 9. 相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求分析 | [REQUIREMENTS.md](REQUIREMENTS.md) | 用户角色、使用场景、功能需求、非功能需求、领域模型、竞品对标 |
| 概念设计 | 本文档 | 可行性分析、技术选型、架构设计、模块划分、路线图 |

---

## 10. 后续步骤

1. ~~**需求分析**~~ ✅ 已完成 — [REQUIREMENTS.md](REQUIREMENTS.md)
2. ~~**项目目录初始化**~~ ✅ 已完成 — Cargo workspace 目录骨架就位
3. **方案详细设计**：将各模块的接口契约、数据流、错误类型定义具体化
4. **工程初始化**：创建 Cargo.toml、Cargo workspace + Tauri 项目骨架
5. **核心 Trait + 类型落地**：将 `CanFrame`、`CanFrameStream` 等写入代码
6. **第一个端到端 MILESTONE**：ASC 文件加载 → 报文列表显示

---

> *文档版本: v0.1 — 概念设计阶段*
> *最后更新: 2026-10-10*