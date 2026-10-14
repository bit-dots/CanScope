# CanScope Design System

本文件为 CanScope 前端 UI 的唯一设计规范来源。所有新页面和组件必须遵循此规范。

---

## 1. 配色 (Colors)

### 背景色 (Backgrounds)

| Token | 色值 | 用途 |
|-------|------|------|
| `--bg-primary` | `#0D0D0D` | 全局页面背景、数据表格背景 |
| `--bg-secondary` | `#1A1A2E` | 面板背景（Toolbar、Sidebar、StatusBar） |
| `--bg-tertiary` | `#16213E` | 按钮默认态、表格 hover 行 |

### 文字色 (Text)

| Token | 色值 | 用途 |
|-------|------|------|
| `--text-primary` | `#E2E8F0` | 标题、正文、重要文字 |
| `--text-secondary` | `#94A3B8` | 辅助标签、时间戳、次要信息 |

### 功能色 (Semantic)

| Token | 色值 | 用途 |
|-------|------|------|
| `--accent` | `#2563EB` | 主色调：选中态、Accent 按钮、链接、焦点环 |
| `--accent-hover` | `#3B82F6` | Accent 按钮 hover |
| `--border` | `#2A2A3E` | 面板分隔线、表格边框、输入框边框 |
| `--success` | `#22C55E` | 播放中状态、操作成功 |
| `--warning` | `#F59E0B` | 警告、CAN 错误帧标识 |
| `--error` | `#EF4444` | 错误、停止状态 |

### Tailwind Theme 映射

```css
@theme {
  --color-bg-primary:    #0D0D0D;
  --color-bg-secondary:  #1A1A2E;
  --color-bg-tertiary:   #16213E;
  --color-text-primary:  #E2E8F0;
  --color-text-secondary:#94A3B8;
  --color-accent:        #2563EB;
  --color-accent-hover:  #3B82F6;
  --color-border:        #2A2A3E;
  --color-success:       #22C55E;
  --color-warning:       #F59E0B;
  --color-error:         #EF4444;
}
```

在组件中使用 Tailwind 类名：`bg-bg-primary`、`text-text-primary`、`border-border` 等。

> **禁止**直接手写 hex 色值。必须使用 token（`var(--xxx)`）或 Tailwind 类名。
> **禁止**使用非 token 色值，如 `#333`、`#fff`（白色/黑色除外）。

---

## 2. 字体 (Typography)

### 字体族

| 角色 | 字体 | 引入 |
|------|------|------|
| 正文 / UI | **IBM Plex Sans** (wght 400, 500, 600, 700) | [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Sans) |
| 等宽 / 数据 | **JetBrains Mono** (wght 400, 500, 600, 700) | [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono) |

```css
font-family: 'IBM Plex Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
```

### 字号层级

| 层级 | 大小 | 字重 | 行高 | 用途 |
|------|------|:--:|:--:|------|
| H1 页面标题 | 32px | 700 | — | WelcomeScreen 主标题 |
| H2 面板标题 | 14px | 600 | 1.5 | 面板区域标题 |
| Body 正文 | 14px | 400 | 1.5 | 全局基准（`:root` 默认） |
| Small 辅助 | 13px | 400 | 1.5 | 表格内容、默认按钮 |
| XS 标签 | 12px | 400 | 1.5 | Toolbar 按钮、Timeline 时间 |
| 2XS 微标签 | 11px | 400 | 1.5 | DBC 信号树 CAN ID |
| 3XS 最小 | 10px | 400 | 1.5 | 信号计数角标 |

### 字重 (Font Weight)

| Token | 数值 | 用途 |
|-------|:--:|------|
| Normal | 400 | 正文、标签 |
| Medium | 500 | 按钮、可交互项 |
| Semibold | 600 | 面板标题、表格表头 |
| Bold | 700 | 页面主标题 |

---

## 3. 间距 (Spacing)

### Tailwind 默认间距体系

使用 Tailwind 4px 基准间距体系。以下为项目中已验证的实际使用值：

| Tailwind | px | 用途 |
|----------|:--:|------|
| `gap-0.5` | 2px | 极小间距 |
| `p-0.5` / `py-0.5` | 2px | StatusBar 内边距 |
| `p-1` / `px-1` | 4px | 紧凑面板内边距 |
| `py-1` / `px-1` | 4px | 按钮垂直内边距 |
| `px-1.5` | 6px | 输入框水平内边距 |
| `py-1.5` | 6px | Toolbar 垂直内边距 |
| `gap-2` | 8px | Toolbar 按钮间距 |
| `px-2.5` | 10px | 按钮水平内边距 |
| `gap-2.5` | 10px | FilterBar 控件间距 |
| `px-3` | 12px | 面板水平内边距 |
| `gap-3` | 12px | FilterBar / Toolbar 组件间距 |
| `gap-4` | 16px | WelcomeScreen 间距 |

### 面板级间距（非 Tailwind）

| 场景 | 值 | 说明 |
|------|:--:|------|
| `p-10` | 40px | WelcomeScreen 内边距 |
| `resizer` | 4px | 面板拖拽手柄宽度/高度 |

### 布局最小高度

| 组件 | 值 |
|------|:--:|
| Toolbar | 40px |
| FilterBar | 30px |
| StatusBar | 24px |

---

## 4. 组件样式 (Components)

### 4.1 按钮 (Buttons)

项目中有三类按钮，均无边框、有圆角。

| 变体 | Tailwind Class | 说明 |
|------|------|------|
| **Muted** | `px-2.5 py-1 rounded bg-bg-tertiary text-text-secondary cursor-pointer text-xs transition-colors duration-150 hover:bg-bg-secondary hover:text-text-primary` | 次要操作（Open File、Load DBC、Save Ctrl+S） |
| **Default** | `px-2.5 py-1 rounded bg-bg-tertiary text-text-primary cursor-pointer text-[13px] transition-colors duration-150 hover:bg-bg-secondary` | 常规操作（Speed 按钮） |
| **Accent** | `px-2.5 py-1 rounded bg-accent text-white cursor-pointer text-[13px] transition-colors duration-150 hover:bg-accent-hover` | 主要操作（Play、Pause） |
| **Welcome Primary** | `px-10 py-2.5 rounded-lg bg-accent text-white text-sm font-medium cursor-pointer` | WelcomeScreen 主按钮 |
| **Welcome Secondary** | `px-10 py-2.5 rounded-lg bg-bg-tertiary text-text-primary text-sm font-medium cursor-pointer border border-border` | WelcomeScreen 次按钮 |

**规则：**
- 圆角：Toolbar 按钮 `rounded` (4px)，Welcome 按钮 `rounded-lg` (8px)
- 边框：Toolbar/FilterBar 按钮无边框；Welcome secondary 按钮有 `border-border`
- 阴影：无
- 过渡：`transition-colors duration-150`
- 焦点：`focus-visible: outline: none; box-shadow: 0 0 0 2px var(--accent); border-radius: 2px`

### 4.2 面板 / 容器 (Panels)

| 组件 | 样式 |
|------|------|
| **Toolbar** | `flex items-center gap-2 px-3 py-1.5 bg-bg-secondary border-b border-border` |
| **FilterBar** | `flex items-center gap-2.5 px-3 py-1 bg-bg-secondary border-b border-border` |
| **StatusBar** | `flex items-center justify-between px-3 py-0.5 bg-bg-secondary border-t border-border text-xs text-text-secondary` |
| **Panel Resizer** | `w-[4px] cursor-col-resize bg-border transition-colors duration-150 hover:bg-accent`（水平）<br>`h-[4px] cursor-row-resize bg-border transition-colors duration-150 hover:bg-accent`（垂直） |

**规则：**
- 圆角：0
- 边框：1px solid `--border`，方向为 `border-b`（顶栏）或 `border-t`（底栏）
- 阴影：无
- 背景：`--bg-secondary`

### 4.3 表格 (Tables)

```css
.frame-table th {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  background: var(--bg-secondary);
  border-bottom: 2px solid var(--border);
}

.frame-table td {
  padding: 4px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}

.frame-table tbody tr:hover {
  background: var(--bg-tertiary);
}
```

**规则：**
- 表头：2px 底部边框（加粗分割），sticky 定位
- 数据行：1px 底部边框
- Hover：`--bg-tertiary` 背景高亮
- 表头固定：`position: sticky; top: 0; z-index: 10`

### 4.4 输入框 (Inputs)

```css
input {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}
```

**规则：**
- 圆角：3px
- 边框：1px solid `--border`
- 背景：`--bg-primary`（比面板更深一层）

### 4.5 滚动条 (Scrollbar)

```css
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
```

### 4.6 焦点环 (Focus Ring)

```css
button:focus-visible,
input:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent);
  border-radius: 2px;
}
```

---

## 5. 交互规范

| 规则 | 值 |
|------|------|
| 过渡时长 | `150ms`（颜色变化） |
| 光标 | 可点击元素必须 `cursor-pointer` |
| Hover | 颜色/背景/透明度变化，**禁止** scale / translate 等导致布局抖动的变换 |
| 动效 | 除 loading 旋转外，**禁止**无限动画 |
| 无障碍 | `prefers-reduced-motion: reduce` 关闭所有动效 |

---

## 6. 图标规范 (Icons)

### 强制要求

| 规则 | 说明 |
|------|------|
| **强制使用 Lucide** | 所有 UI 图标必须来自 [Lucide](https://lucide.dev) 图标库，通过 `lucide-solid` 包引入 |
| **禁止手写 SVG** | 禁止在组件中内联手写 `<svg>` 标签。如 Lucide 中不存在所需图标，优先考虑使用语义相近的替代，确实无法替代时才允许手写 |
| **禁止 emoji** | 禁止使用 emoji 作为 UI 图标 |
| **尺寸** | 16px (`size={16}`) 用于按钮内图标，20px (`size={20}`) 用于独立展示 |
| **颜色** | 继承父级文字色，通过 CSS `color` 控制，图标组件不做颜色设置 |
| **无障碍** | 交互式图标按钮必须设置 `aria-label`；纯装饰图标设置 `aria-hidden="true"` |

### 导入方式

```tsx
import { Database, FilePlus, Link, CircleHelp, X } from 'lucide-solid';
```

### 使用示例

```tsx
// 按钮内图标
<button aria-label="导入">
  <FilePlus size={16} />
</button>

// 独立展示
<Database size={20} class="text-text-secondary" />
```

### 项目中已使用的 Lucide 图标

| 图标 | Lucide 名称 | 使用位置 |
|------|-----------|---------|
| ⊕ (加号圆圈) | `PlusCircle` | 数据库管理 - 导入按钮 |
| 🔗 (链接) | `Link` | 数据库管理 - 通道绑定 |
| ? (帮助) | `CircleHelp` | 数据库管理 - 帮助按钮 |
| ✕ (关闭) | `X` | 标题栏关闭按钮 |
| 📄 (文件) | `File` | 数据库管理 - 文件图标 |
| 🗄 (数据库) | `Database` | Ribbon - 数据库按钮 |
| 📁 (资源管理器) | `FolderOpen` | Ribbon - 资源管理器按钮 |

---

## 7. 技术栈约定

| 层 | 技术 | 版本 |
|----|------|:--:|
| 框架 | SolidJS | 1.x |
| CSS | Tailwind CSS | 4.x |
| 图标 | Lucide Solid（必须） | — |
| 图表 | uPlot | — |
| 桌面壳 | Tauri | 2.x |

> **新组件必须使用 Tailwind class，禁止使用内联 `style` 对象。** 仅动态尺寸（如 `width: panelWidth() + 'px'`）可使用内联 style。

---

> 最后更新：2026-01-12