# 报文监控面板 — 现状审计 & 功能/UI 设计

> 版本：v1.1
> 日期：2026-10-16
> 状态：✅ 已全部实施（Phase A/B/C/D 完成）
> 来源：design-taste-frontend / redesign-existing-projects / ui-ux-pro-max 三技能审计

---

## 1. 涉及文件

| # | 文件 | 职责 |
|---|------|------|
| 1 | `frontend/src/components/FrameTable.tsx` | 主组件：虚拟滚动表格 + 工具栏 + 搜索 + 属性面板 + 右键菜单（~1200 行） |
| 2 | `frontend/src/App.css` | 全部 CSS 样式（L100-L898，`.frame-table__*` BEM 命名） |
| 7 | `frontend/src/components/FrameTableSettings.ts` | 列可见性设置：加载/持久化到 localStorage |
| 8 | `frontend/src/components/FrameTableSettingsDialog.tsx` | 列设置弹窗：勾选显示/隐藏列 + 恢复默认 |
| 9 | `frontend/src/components/ContextMenu.tsx` | 右键上下文菜单组件（复用） |
| 3 | `frontend/src/App.tsx` | 面板注册（L54）+ 渲染集成（L663-L668） |
| 4 | `frontend/src/types.ts` | 类型定义：`FrameInfo`, `FilterConfig`, `formatHex`, `formatDataHex`, `matchesFilter` |
| 5 | `docs/design/design.md` | 全局设计规范（表格规范 L241-L249） |
| 6 | `docs/design/ui-refactoring-spec.md` | UI 重构规格（报文监控特殊需求 L161-L163） |

---

## 2. 设计三旋钮 (Dials)

因报文监控属于**数据监控工具面板**（非 landing/portfolio），核心理念：**紧凑、可预测、静态。**

| 旋钮 | 值 | 含义 |
|:--|:--:|------|
| `DESIGN_VARIANCE` | **3** | 数据表格要求严格对称、列对齐、布局可预测 |
| `MOTION_INTENSITY` | **2** | 仅保留字节变化闪烁 + 行 hover；无动画炫技 |
| `VISUAL_DENSITY` | **9** | Cockpit 级密度：28px 行高、10-11px mono 字体、紧凑 padding |

---

## 3. 现状诊断

### 3.1 ✅ 已正确实现

| 功能 | 实现情况 |
|------|---------|
| 虚拟滚动 | `ROW_HEIGHT=28px`, `OVERSCAN=20`，仅渲染可视行 ±20 行，大报文量流畅 |
| 时间格式切换 | 3 种模式（绝对/相对起始/相对上一帧）+ Portal 下拉菜单 + `time-menu-in` 动画 |
| 行选中态 | 蓝色左边框 `inset 2px 0 0 var(--accent)` + 背景 `color-mix(accent 14%, bg-primary)` |
| 帧类型 Badge | CAN(绿) / CAN FD(蓝) / CAN FD BRS(亮蓝) — `--success` / `--accent` / `--accent-hover` |
| 斑马纹 | 偶数行 35% bg-secondary tint |
| 状态栏 | RX / TX / Err 计数器 + "已暂停"标识 |
| 空状态 | `Activity` 图标 + "暂无数据" 占位 |
| 颜色 Token 化 | 全部 `var(--*)` / `color-mix()`，无裸 hex 值 |
| CSS 命名规范 | 全部 `frame-table__*` BEM 命名，结构清晰 |

### 3.2 ✅ 已全部修复（Phase A/B/C/D 完成）

| 严重度 | ID | 问题 | 修复方式 |
|:---:|:--:|------|------|
| **P0** | B01 | ~~查找按钮无功能~~ ✅ | Ctrl+F 快捷键 + 内联搜索栏（结果导航、大小写敏感、全字匹配） |
| **P0** | B02 | ~~属性按钮无功能~~ ✅ | 侧边属性面板（属性树 + Hex 数据 + 可拖拽调整宽度/比例） |
| **P0** | B03 | ~~清空按钮无功能~~ ✅ | 二次确认机制（点击变红脉动，再次点击确认清空，2s 超时自动取消） |
| **P0** | B04 | ~~无右键上下文菜单~~ ✅ | 完整右键菜单（复制行/ID/Hex/Binary/信号值、添加到曲线、按ID过滤、查看属性） |
| **P0** | B05 | ~~无独立搜索/筛选入口~~ ✅ | 搜索栏（Ctrl+F）+ 列级筛选行（时间/通道/ID/类型/DLC/数据/名称 七列可单独筛选） |
| **P1** | B06 | ~~方向列始终 RX~~ ✅ | 使用 `frame.is_tx` 字段自动判断 RX/TX |
| **P1** | B07 | ~~DBC 加载后无信号值列~~ ✅ | 可展开信号子行（点击 ▶ 展开，显示 `信号名=物理值 单位`），子行 mono 字体 |
| **P1** | B08 | ~~无列自定义~~ ✅ | FrameTableSettings + 设置弹窗（勾选显示/隐藏列 + 恢复默认，持久化 localStorage） |
| **P1** | B09 | ~~无变化字节高亮~~ ✅ | `byte-changed` CSS 动画（450ms `--warning` 闪烁，支持 `prefers-reduced-motion`） |
| **P2** | B10 | ~~无列宽拖拽~~ ✅ | 表头列间 `col-resize` 拖拽手柄（固定最小宽度，hover/accent 高亮） |
| **P2** | B11 | ~~无多选行~~ ✅ | Ctrl+Click 多选 / Shift+Click 范围选择 + 多选样式（8% accent tint） |
| **P2** | B12 | ~~无报文属性详情~~ ✅ | 属性面板（基本信息 + DBC 信息 + 信号值树 + Hex 数据 + 上下分割比例可调） |

---

## 4. 功能蓝图

```
┌─ 报文监控 ───────────────────────────── [×] [□] [↗] ─┐
│ ┌─ 工具栏 ────────────────────────────────────────────┐ │
│ │ [🔍 查找] [⏸ 暂停] [🕐 时间▾] [📋 列▾]     [🗑 清空] │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─ 列头 (右键可自定义) ───────────────────────────────┐ │
│ │  时间 │通道│  ID  │名称│类型│方向│DLC│数据(HEX)     │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ 00:00:12.345│CH1│0x7E8│EMS │CANFD│RX│ 8 │A1 B2 ..  │ │  ← 变化字节闪烁
│ │ 00:00:12.356│CH1│0x7E9│TCU │CAN  │RX│ 8 │C3 D4 ..  │ │
│ │ 00:00:12.367│CH1│0x123│Eng │CANFD│RX│64 │...       │ │
│ │  ...                                                  │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │  RX: 12,345   |   TX: 0   |   Err: 2   |   ⬤ 已暂停  │ │  ← 状态栏
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 5. 功能清单 & 优先级（✅ 全部已实现）

| 优先级 | ID | 功能 | 实现状态 |
|:---:|:--:|------|:------:|
| **P0** | F01 | **查找/搜索** | ✅ Ctrl+F 展开搜索栏，支持 CAN ID(hex/dec)、数据 hex、信号名搜索，结果导航+高亮 |
| **P0** | F02 | **清空列表** | ✅ 二次确认后清空（红脉动确认，2s 超时自动取消） |
| **P0** | F03 | **右键行上下文菜单** | ✅ 复用 `ContextMenu` 组件：复制行/ID/Hex/Binary/信号值、添加到曲线、按ID过滤、查看属性 |
| **P1** | F04 | **列自定义(显示/隐藏)** | ✅ ⚙ 设置弹窗勾选列 + 恢复默认，持久化 `localStorage` |
| **P1** | F05 | **变化字节高亮** | ✅ `byte-changed` CSS 动画 450ms `--warning` 闪烁，仅新帧、非暂停时触发 |
| **P1** | F06 | **DBC 信号值子列** | ✅ 时间列点击 ▶ 展开信号子行：`信号名=物理值 单位`，子行 mono 字体 |
| **P2** | F07 | **列宽拖拽** | ✅ `col-resize` 手柄，表头列间 mousedown/move/up，保留最小宽度 |
| **P2** | F08 | **多选行** | ✅ Ctrl+Click 追加，Shift+Click 范围选择，多选样式 8% accent tint |
| **P2** | F09 | **方向自动判断** | ✅ 基于 `frame.is_tx` 字段，RX(蓝) / TX(绿) Badge |
| **P2** | F10 | **报文属性详情** | ✅ 侧边属性面板：基本信息 + DBC 信息 + 信号值树 + Hex 数据，上下拖拽比例可调 |

---

## 6. UI 详细设计

### 6.1 工具栏重设计

**当前状态（5 按钮，3 个无功能）：**

```
[🔧 属性]  [🔍 查找]  [🗑 清空]  [⏸ 暂停]  [🕐 时间▾]
```

**方案 A — 纯按钮 + 搜索展开（推荐）：**

```
左侧                                    右侧
[🔍 查找] [⏸ 暂停] [🕐 时间▾] [📋 列▾]    [🗑 清空]
```

- "属性"按钮废除，功能迁移到右键菜单 →「查看报文属性」
- 新增「列设置」按钮替代"属性"按钮的位置
- "查找"点击后展开内联搜索栏；若搜索激活则替换为 `[搜索输入框...  |  ↑↓ 结果导航  |  ✕ 关闭]`

**搜索栏展开态：**

```
[🔍 0x7E8_________________] [3/45 ↑↓] [Aa 大小写] [✕ 关闭]  [⏸] [🕐▾] [📋▾]  [🗑]
```

- 搜索支持：CAN ID (hex/dec)、数据 hex 内容、信号名
- 搜索结果高亮（匹配行用 `--accent` 浅背景），方向键上下导航
- `Esc` 关闭搜索栏

---

### 6.2 右键行上下文菜单

```
┌──────────────────────┐
│ 复制行               │  ← 复制当前行文本
├──────────────────────┤
│ 复制 CAN ID          │  ← "0x7E8"
│ 复制数据 (Hex)       │  ← "A1 B2 C3 D4 E5 F6 00 01"
│ 复制数据 (Binary)    │  ← "10100001 10110010 ..."
│ 复制信号值           │  ← "EngineSpeed=2400, CoolantTemp=92"  (仅 DBC 加载后)
├──────────────────────┤
│ 添加到信号曲线       │  ← 将 CAN ID 绑定到曲线面板
│ 按此 CAN ID 过滤     │  ← 设置全局 FilterBar CAN ID = 当前帧 CAN ID
├──────────────────────┤
│ 查看报文属性         │  ← 展开详情面板
└──────────────────────┘
```

**实现方式**：复用项目已有的 `ContextMenu` 组件（`frontend/src/components/ContextMenu.tsx`）。

---

### 6.3 列自定义

**默认列配置：**

| 列 | 默认可见 | 宽度 | 字体 | 说明 |
|---|:--:|:--:|---|---|
| 时间 | ✅ | 110px | `--font-mono` 11px | 根据时间格式切换 |
| 通道 | ✅ | 48px | `--font-mono` 10.5px | CH1 / CH2 |
| ID | ✅ | 72px | `--font-mono` 11px `w500` | 3 位或 8 位 hex |
| 名称 | ❌ | 120px | `--font-sans` 11px | 仅 DBC 加载后显示 |
| 类型 | ✅ | 48px | `--font-mono` 10px | Badge: CAN / CAN FD / BRS |
| 方向 | ✅ | 42px | `--font-mono` 10px | Badge: RX / TX |
| DLC | ✅ | 40px | `--font-mono` 11px | 0-64 |
| 数据(Hex) | ✅ | auto | `--font-mono` 10.5px | 变化字节闪烁高亮 |
| 信号值 | ❌ | auto | `--font-sans` 11px | 仅 DBC 加载后显示 |

**列设置菜单（点击 📋 按钮弹出）：**

```
┌─ 列设置 ────────────────┐
│ ☑ 时间                  │
│ ☑ 通道                  │
│ ☑ ID                    │
│ ☐ 名称     (需加载DBC)   │
│ ☑ 类型                  │
│ ☑ 方向                  │
│ ☑ DLC                   │
│ ☑ 数据(Hex)             │
│ ☐ 信号值   (需加载DBC)   │
│ ─────────────────────── │
│ [恢复默认]               │
└─────────────────────────┘
```

**状态持久化**：列可见性存入 `localStorage`，键名 `canscope.frame-monitor.columns`。

---

### 6.4 变化字节高亮

```
帧 N-1:  A1 B2 C3 D4 E5 F6 00 01   (CAN ID 0x7E8 上一帧)
帧 N:    A1 FF C3 D4 E5 F6 00 01   (CAN ID 0x7E8 当前帧)
                     ↑
               B2 → FF 变化：闪烁 300ms
```

**CSS 动画：**

```css
.byte-changed {
  animation: byte-flash 300ms ease-out;
}
@keyframes byte-flash {
  0%   { background: var(--warning); color: var(--bg-primary); border-radius: 2px; }
  100% { background: transparent; color: inherit; }
}
```

**实现思路**：

1. `FrameTable` 内维护 `prevFrameData: Map<number, number[]>`（CAN ID → 上一帧 data 字节数组）
2. 新帧到达时，查找同 CAN ID 的上一帧数据，逐字节对比
3. 差异字节在数据列中渲染为 `<span class="byte-changed">FF</span>`
4. 仅在**非暂停状态**和**新帧追加时**触发；历史帧不闪烁

---

### 6.5 DBC 信号值子列

当 `hasDbc=true` 且帧数据有 `signals` 字段时，在数据列右侧展示：

```
数据(HEX)                             信号值
A1 B2 C3 D4 E5 F6 00 01              EngineSpeed=2400 rpm, CoolantTemp=92 °C
```

**规则**：
- 信号值列仅在 DBC 加载后可见
- 显示格式：`{name}={physical_value} {unit}`
- 多信号用 `, ` 分隔
- 已解码值来自 `FrameInfo.signals: DecodedSignalInfo[]`

---

### 6.6 空状态 & 无数据状态

| 状态 | 展示 |
|------|------|
| **无文件打开** | `Activity` 图标 + "请先打开 ASC/CSV 文件" |
| **文件已加载但无帧** | `Activity` 图标 + "暂无报文数据" |
| **搜索无结果** | 行列表不变 + 搜索栏显示 "0 个匹配结果" |
| **加载中** | 骨架屏（5 行浅色脉冲条模拟表格行） |

---

## 7. 实施计划（✅ 全部完成）

| 阶段 | 内容 | 状态 |
|:--:|------|:--:|
| **Phase A** | F01 查找搜索 + F02 清空 + F03 右键菜单 | ✅ 完成 |
| **Phase B** | F04 列自定义 + F05 变化字节高亮 | ✅ 完成 |
| **Phase C** | F06 信号值子列 + F10 报文属性详情 | ✅ 完成 |
| **Phase D** | F07 列宽拖拽 + F08 多选 + F09 方向自动 | ✅ 完成 |

**实际实现中额外增加的功能：**
| 功能 | 说明 |
|------|------|
| ⭐ 行标记（Star） | 点击星标标记重要帧，标记态 `--accent` 高亮 |
| 🔽 自动滚动 | 新帧到达时自动滚到底部，工具栏按钮切换开关 |
| ⚙ 设置面板 | 统一设置入口（时间格式 / 列可见性 / 变化高亮 / 自动滚动），持久化 `localStorage` |
| 📋 列筛选行 | 表头展开按钮 → 每列下方独立筛选输入框 / 下拉选择器 |
| 🏷 类型筛选下拉 | 类型列表头点击弹出 CAN / CAN FD / BRS 单选下拉菜单 |
| 📐 属性面板分屏 | 属性面板上下分割（属性树 / Hex 数据），中间可拖拽调整比例 |
| ⌨ Ctrl+F 全局快捷键 | 面板聚焦时 `Ctrl+F` 即可打开搜索栏 |

---

## 8. 设计原则检查清单

### 颜色 & 对比度
- [x] 所有色值使用 `var(--*)` token，**禁止裸 hex**
- [x] 搜索高亮背景：`color-mix(in srgb, var(--warning) 10%, transparent)`（普通匹配）/ `20%`（当前选中）
- [x] 变化字节闪烁使用 `--warning` token
- [x] 上下文菜单背景：`--bg-tertiary`，边框：`--border`

### 字体
- [x] 数据列：`--font-mono` (JetBrains Mono)
- [x] 标签/信号名：`--font-sans` (IBM Plex Sans)
- [x] 字号层级遵守 [design.md](file:///e:/dev/canscope/docs/design/design.md) 规定

### 交互
- [x] 所有过渡 `transition: 150ms`
- [x] 按钮 hover 无 layout shift（不使用 scale/translate）
- [x] `cursor-pointer` 在所有可点击元素上
- [x] 焦点环 `box-shadow: 0 0 0 2px var(--accent)`

### 动画
- [x] 字节闪烁是**唯一新增动画**（450ms，设计为 300ms 的实际调整）
- [x] `prefers-reduced-motion: reduce` → 关闭字节闪烁
- [x] Portal 下拉菜单已有 `time-menu-in` / `type-filter-menu-in` 动画（120ms ease-out）

### 图标
- [x] **仅使用 `lucide-solid`**，禁止手写 SVG / emoji
- [x] 按钮内图标 `size={14}`，独立图标 `size={13-14}`

### 无障碍
- [x] 所有图标按钮有 `aria-label`
- [x] 上下文菜单支持键盘导航（`ArrowUp/Down`, `Enter`, `Escape`）
- [x] 搜索栏 `Esc` 关闭 + `Enter/Shift+Enter` 导航
- [x] 表头可聚焦（`tabindex`）

---

> **审计完成日期**：2026-10-15
> **全部实施完成日期**：2026-10-16
> **实际实现**：Phase A-D 全部完成，另额外增加行标记、自动滚动、列筛选行、类型下拉筛选、属性分屏、Ctrl+F 快捷键等增强功能。