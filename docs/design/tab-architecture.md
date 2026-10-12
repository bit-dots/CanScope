# CanScope — Tab 架构重构设计

> 状态：待实施 | 日期：2026-10-12

---

## 动机

当前所有功能（打开文件、加载 DBC、回放控制）平铺在顶部 Toolbar 上，缺乏功能分区。引入 **通道（Channel）** 和 **顶部 Tab 导航**，将工程配置、回放分析、DBC 管理分隔为独立子功能。

---

## 概念关系

```
Project
  │
  ├── channels[]               ← 通道列表（默认 1 个 "CAN1"）
  │     ├── name: "CAN1"
  │     └── dbc_paths: [...]
  │
  └── can_log_path: "xxx.asc"  ← 上次回放的数据源（不属于任何通道）

ASC 文件加载进回放引擎 → 引擎按帧的通道号分发 → 解码时查对应通道的 DBC
```

---

## Tab 设计

```
┌──────────────────────────────────────────────────┐
│  CanScope — SampleDrive                    [Save] │  ← 精简 Toolbar
├──────────────────────────────────────────────────┤
│  [Home]  [Playback]  [DBC & Channels]            │  ← Tab Bar
├──────────────────────────────────────────────────┤
│                                                    │
│   当前 Tab 的内容区                                │
│                                                    │
├──────────────────────────────────────────────────┤
│  StatusBar                                         │
└──────────────────────────────────────────────────┘
```

### Home Tab — 工程概览

- 工程名称、创建时间、修改时间
- 通道概览卡片（通道名 + 已绑定 DBC 数量）
- 上次回放数据源路径
- 快捷入口（跳转到 Playback / DBC & Channels）

### Playback Tab — 数据回放

- **数据源加载**：加载 ASC/CAN 日志文件
- **回放控制**：Play / Pause / Stop / Seek / Speed（全部在 Tab 内）
- **过滤栏**：CAN ID + 时间范围过滤
- **时间轴**：全局进度条 + seek
- **三分栏布局**：SignalTree | FrameTable | SignalChart
- **信号绑定**：信号树中点击信号绑定到图表

### DBC & Channels Tab — DBC 与通道管理（MVP 合并）

- **通道管理**：通道列表（默认 "CAN1"）
  - 通道增删、重命名（MVP 可只保留默认通道）
- **DBC 管理**：加载/删除 DBC 文件
  - 按 DBC 浏览信号树
  - **将 DBC 绑定到通道**（核心操作）

---

## 与当前代码的差异

| 当前 | 改为 |
|------|------|
| 所有功能平铺在一个 Toolbar | Tab Bar 顶部切换 |
| `Open File` 在 Toolbar 上 | 移到 Playback Tab 内 |
| `Load DBC` 在 Toolbar 上 | 移到 DBC & Channels Tab 内 |
| Play/Pause/Stop/Speed 在 Toolbar 上 | 移到 Playback Tab 内 |
| `dbc_paths` 在工程级别 | 移到 `channels[].dbc_paths` |

---

## 数据结构变更

### Rust 侧 (ProjectConfig)

```rust
// 新增
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChannelConfig {
    name: String,
    dbc_paths: Vec<String>,
}

// 修改
struct ProjectConfig {
    name: String,
    can_log_path: Option<String>,
    channels: Vec<ChannelConfig>,     // 新增：取代 dbc_paths
    // dbc_paths: Vec<String>,        // 删除
    last_position: f64,
    filters: FilterConfigJson,
    chart_signals: Vec<ChartSignalJson>,
    ui_layout: UiLayoutJson,
    created_at: String,
    modified_at: String,
}
```

### TypeScript 侧 (types.ts)

```typescript
// 新增
export interface ChannelConfig {
  name: string;
  dbcPaths: string[];
}

// 修改 ProjectInfo
export interface ProjectInfo {
  name: string;
  canLogPath: string | null;
  channels: ChannelConfig[];       // 新增：取代 dbcPaths
  // dbcPaths: string[];           // 删除
  lastPosition: number;
  filters: FilterConfigJson;
  chartSignals: ChartSignalJson[];
  uiLayout: UiLayoutJson;
  createdAt: string;
  modifiedAt: string;
  projectPath: string | null;
}
```

---

## 执行计划

### Phase 1 — Rust 后端：引入 Channel 概念

**文件**：`crates/canscope-app/src/lib.rs`

| 步骤 | 内容 |
|:--:|------|
| 1a | 新增 `ChannelConfig { name, dbc_paths }` 结构体 |
| 1b | `ProjectConfig` 移除 `dbc_paths`，新增 `channels: Vec<ChannelConfig>` |
| 1c | `create_project` 自动创建默认通道 `"CAN1"` |
| 1d | `open_project` 兼容旧工程：无 `channels` 字段时，自动将 `dbc_paths` 迁移到 `"CAN1"` 通道 |
| 1e | 新增 `add_dbc_to_channel(channel_name, dbc_path)` IPC 命令 |
| 1f | 新增 `remove_dbc_from_channel(channel_name, dbc_path)` IPC 命令 |
| 1g | `get_dbc_tree` 合并所有通道的 DBC 信号树（解码时全通道可用） |
| 1h | 更新 `ProjectInfo` 返回结构（`channels` 取代 `dbc_paths`） |
| 1i | 更新 `add_to_recent` / `save_project` 等相关序列化路径 |

### Phase 2 — 前端：新建组件

| 步骤 | 文件 | 内容 |
|:--:|------|------|
| 2a | 新建 `TabBar.tsx` | 三个 Tab 按钮：Home / Playback / DBC & Channels，接收 `activeTab` + `onChange` props |
| 2b | 新建 `HomeTab.tsx` | 工程概览：名称、通道卡片、数据源路径、跳转按钮 |
| 2c | 新建 `PlaybackTab.tsx` | 包含：Open File 按钮 + 路径显示、Play/Pause/Stop/Speed 控件、FilterBar、Timeline、三分栏布局（SignalTree + FrameTable + SignalChart）。接收必要 props（frames、metadata、dbcTree 等），内部管理回放相关回调 |
| 2d | 新建 `DbcChannelTab.tsx` | 左侧通道列表 + 右侧 DBC 管理面板。通道增删（MVP 可暂不实现增删），DBC 加载/删除/绑定到通道 |

### Phase 3 — 前端：App.tsx 重构

| 步骤 | 内容 |
|:--:|------|
| 3a | 新增 `activeTab` 信号（默认 `'home'`，有数据源时自动切 `'playback'` ？ 待定） |
| 3b | Toolbar 精简：移除 `onFileOpen`、`onLoadDbc`、`sourceLoaded`、`playbackState`、`onPlaybackControl`、`speed`、`onSpeedChange` props。仅保留：工程名 + Save + Save As + Close |
| 3c | `main-content` 改为 Tab 切换渲染，移除 `hasSource()` 条件 |
| 3d | 回调重新分配：文件加载/回放控制 → PlaybackTab；DBC 加载 → DbcChannelTab |
| 3e | 状态保留在 App.tsx 顶层（frames、metadata、dbcTree 等），通过 props 传递给各 Tab |

### Phase 4 — TypeScript 类型对齐

| 步骤 | 内容 |
|:--:|------|
| 4a | `types.ts` 新增 `ChannelConfig` 类型 |
| 4b | `types.ts` 更新 `ProjectInfo`（`channels` 取代 `dbcPaths`） |
| 4c | 所有引用 `proj.dbcPaths` 的地方改为 `proj.channels` |

---

## 影响面评估

| 文件 | 改动量 | 类型 |
|------|:--:|:--:|
| `crates/canscope-app/src/lib.rs` | ~40 行增改 | 修改 |
| `frontend/src/App.tsx` | -50 行（删）+20 行（tab 逻辑） | 修改 |
| `frontend/src/components/Toolbar.tsx` | -45 行（删 playback props/UI） | 修改 |
| `frontend/src/types.ts` | +10 行 | 修改 |
| `frontend/src/components/TabBar.tsx` | ~40 行 | **新建** |
| `frontend/src/components/HomeTab.tsx` | ~60 行 | **新建** |
| `frontend/src/components/PlaybackTab.tsx` | ~220 行（从 App.tsx 迁出 + 回放控件） | **新建** |
| `frontend/src/components/DbcChannelTab.tsx` | ~140 行 | **新建** |

总计：4 个文件修改 + 4 个文件新建，预计工作量约 1-1.5 小时。

---

## 后续扩展

- **物理通道绑定**：Channel 新增 `hardware_id` 字段，连接真实 CAN 硬件时自动映射
- **多通道同时回放**：每个通道独立回放引擎，可同时播放多个 ASC 文件
- **通道级过滤**：Filter 可按通道筛选报文
- **通道级信号绑定**：信号绑定到图表时标注来源通道