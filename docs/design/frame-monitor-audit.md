# 报文监控面板 — 现状审计 & 功能/UI 设计

> 版本：v1.0
> 日期：2026-10-15
> 状态：待审查
> 来源：design-taste-frontend / redesign-existing-projects / ui-ux-pro-max 三技能审计

---

## 1. 涉及文件

| # | 文件 | 职责 |
|---|------|------|
| 1 | `frontend/src/components/FrameTable.tsx` | 主组件：虚拟滚动表格 + 工具栏 + 状态栏（333 行） |
| 2 | `frontend/src/App.css` | 全部 CSS 样式（L100-L449，`.frame-table__*` BEM 命名） |
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

### 3.2 ❌ 需修复 & 待实现

| 严重度 | ID | 问题 | 位置 |
|:---:|:--:|------|------|
| **P0** | B01 | **查找按钮无功能** — 点击后无任何反应，纯占位死按钮 | [FrameTable.tsx:L164-L172](file:///e:/dev/canscope/frontend/src/components/FrameTable.tsx) |
| **P0** | B02 | **属性按钮无功能** — 点击后无任何反应 | [FrameTable.tsx:L154-L162](file:///e:/dev/canscope/frontend/src/components/FrameTable.tsx) |
| **P0** | B03 | **清空按钮无功能** — 点击后无任何反应 | [FrameTable.tsx:L174-L181](file:///e:/dev/canscope/frontend/src/components/FrameTable.tsx) |
| **P0** | B04 | **无右键上下文菜单** — 行上无法复制/筛选/绑定信号 | — |
| **P0** | B05 | **无独立搜索/筛选入口** — 仅有全局 FilterBar（CAN ID + 时间范围），面板内无法快速搜索 | — |
| **P1** | B06 | **方向列始终 RX** — 无 TX/双向区分逻辑 | [FrameTable.tsx:L291](file:///e:/dev/canscope/frontend/src/components/FrameTable.tsx) |
| **P1** | B07 | **DBC 加载后无信号值列** — 仅显示 `message_name`，不展示 decoded signal values | [FrameTable.tsx:L282-L283](file:///e:/dev/canscope/frontend/src/components/FrameTable.tsx) |
| **P1** | B08 | **无列自定义** — spec 要求右键表头显示/隐藏列 | [ui-refactoring-spec.md:L161-L163](file:///e:/dev/canscope/docs/design/ui-refactoring-spec.md) |
| **P1** | B09 | **无变化字节高亮** — spec 要求相邻帧变化字节闪烁提示 | [ui-refactoring-spec.md:L161-L163](file:///e:/dev/canscope/docs/design/ui-refactoring-spec.md) |
| **P2** | B10 | **无列宽拖拽** — 列宽固定，无法调整 | — |
| **P2** | B11 | **无多选行** — 仅支持单选 | — |
| **P2** | B12 | **无报文属性详情** — 选中行后无二次确认可查看帧详情/信号解析 | — |

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

## 5. 功能清单 & 优先级

| 优先级 | ID | 功能 | 交互/触发方式 |
|:---:|:--:|------|--------------|
| **P0** | F01 | **查找/搜索** | 点击 🔍 按钮或 `Ctrl+F` → 在工具栏展开搜索输入框；支持按 CAN ID (hex/dec)、数据 hex 内容、信号名搜索 |
| **P0** | F02 | **清空列表** | 点击 🗑 按钮 → 二次确认后清空当前报文列表（不影响后端数据） |
| **P0** | F03 | **右键行上下文菜单** | 右键表格行 → 弹出菜单 |
| **P1** | F04 | **列自定义(显示/隐藏)** | 点击 📋「列设置」按钮 或 右键表头 → 勾选/取消列 |
| **P1** | F05 | **变化字节高亮** | 新帧到达时自动与同 CAN ID 上一帧对比，变化字节短暂闪烁（300ms, `--warning`） |
| **P1** | F06 | **DBC 信号值子列** | 加载 DBC 后自动在数据列右侧展开信号值展示（如 `EngineSpeed=2400 rpm`） |
| **P2** | F07 | **列宽拖拽** | 表头列间 `cursor-col-resize` + `mousedown/mousemove/mouseup` |
| **P2** | F08 | **多选行** | `Ctrl+Click` 多选 / `Shift+Click` 范围选择 |
| **P2** | F09 | **方向自动判断** | 依后端 `FrameInfo` 新增 `direction` 字段，RX/TX 自动切换 |
| **P2** | F10 | **报文属性详情** | 选中行 → 底部或侧边展开详情（帧详情 + 信号解析，已有 `signal-decode` 面板可复用） |

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

## 7. 实施计划

| 阶段 | 内容 | 涉及文件 |
|:--:|------|------|
| **Phase A** | F01 查找搜索 + F02 清空 + F03 右键菜单 | `FrameTable.tsx`, `App.css`, 复用 `ContextMenu.tsx` |
| **Phase B** | F04 列自定义 + F05 变化字节高亮 | `FrameTable.tsx`, `App.css` |
| **Phase C** | F06 信号值子列 + F10 报文属性详情 | `FrameTable.tsx`, `App.css`, `types.ts`（可能需要扩展 `FrameInfo`） |
| **Phase D** | F07 列宽拖拽 + F08 多选 + F09 方向自动 | `FrameTable.tsx`, `App.css`, `types.ts` |

---

## 8. 设计原则检查清单

### 颜色 & 对比度
- [ ] 所有色值使用 `var(--*)` token，**禁止裸 hex**
- [ ] 搜索高亮背景：`color-mix(in srgb, var(--warning) 25%, transparent)`
- [ ] 变化字节闪烁使用 `--warning` token
- [ ] 上下文菜单背景：`--bg-tertiary`，边框：`--border`

### 字体
- [ ] 数据列：`--font-mono` (JetBrains Mono)
- [ ] 标签/信号名：`--font-sans` (IBM Plex Sans)
- [ ] 字号层级遵守 [design.md](file:///e:/dev/canscope/docs/design/design.md) 规定

### 交互
- [ ] 所有过渡 `transition: 150ms`
- [ ] 按钮 hover 无 layout shift（不使用 scale/translate）
- [ ] `cursor-pointer` 在所有可点击元素上
- [ ] 焦点环 `box-shadow: 0 0 0 2px var(--accent)`

### 动画
- [ ] 字节闪烁是**唯一新增动画**
- [ ] `prefers-reduced-motion: reduce` → 关闭字节闪烁
- [ ] Portal 下拉菜单已有 `time-menu-in` 动画

### 图标
- [ ] **仅使用 `lucide-solid`**，禁止手写 SVG / emoji
- [ ] 按钮内图标 `size={14}`，独立图标 `size={16}`

### 无障碍
- [ ] 所有图标按钮有 `aria-label`
- [ ] 上下文菜单支持键盘导航（`ArrowUp/Down`, `Enter`, `Escape`）
- [ ] 搜索栏 `Esc` 关闭
- [ ] 表头可聚焦（`tabindex`）

---

> 预估总工时参考：Phase A 约 1 天，Phase B 约 1.5 天，Phase C 约 1 天，Phase D 约 1 天。
> 总计约 4.5 人天（含测试和打磨）。