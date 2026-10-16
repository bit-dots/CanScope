import { Component, createSignal, onMount } from 'solid-js';
import { X } from 'lucide-solid';
import type { FrameTableSettings } from './FrameTableSettings';
import { getDefaultSettings } from './FrameTableSettings';

const COLUMN_META: { key: string; label: string; needsDbc?: boolean }[] = [
  { key: 'time', label: '时间' },
  { key: 'channel', label: '通道' },
  { key: 'canid', label: 'ID' },
  { key: 'name', label: '名称', needsDbc: true },
  { key: 'type', label: '类型' },
  { key: 'direction', label: '方向' },
  { key: 'dlc', label: '长度' },
  { key: 'data', label: '数据' },
];

interface FrameTableSettingsDialogProps {
  settings: FrameTableSettings;
  hasDbc: boolean;
  onApply: (s: FrameTableSettings) => void;
  onClose: () => void;
}

const FrameTableSettingsDialog: Component<FrameTableSettingsDialogProps> = (props) => {
  const [draft, setDraft] = createSignal<FrameTableSettings>({ ...props.settings });

  const toggleColumn = (key: string) => {
    setDraft((prev) => {
      const cols = [...prev.visibleColumns];
      const idx = cols.indexOf(key);
      if (idx >= 0) {
        cols.splice(idx, 1);
      } else {
        cols.push(key);
      }
      return { ...prev, visibleColumns: cols };
    });
  };

  const setField = <K extends keyof FrameTableSettings>(k: K, v: FrameTableSettings[K]) => {
    setDraft((prev) => ({ ...prev, [k]: v }));
  };

  const handleApply = () => {
    const d = draft();
    const cols = d.visibleColumns.filter((c) =>
      COLUMN_META.some((m) => m.key === c && (!m.needsDbc || props.hasDbc)),
    );
    props.onApply({ ...d, visibleColumns: cols });
    props.onClose();
  };

  const handleReset = () => {
    setDraft(getDefaultSettings());
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      props.onClose();
    }
  };

  onMount(() => {
    const first = (document.querySelector(
      '.frame-settings__input, .frame-settings__radio, .frame-settings__checkbox',
    ) as HTMLElement | null);
    first?.focus();
  });

  return (
    <div class="npd-overlay" onClick={props.onClose}>
      <div class="npd-dialog frame-settings-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div class="npd-header">
          <h2 class="npd-title">报文监控设置</h2>
          <button class="npd-close" onClick={props.onClose} title="关闭">
            <X size={16} />
          </button>
        </div>

        <div class="npd-body frame-settings-body">
          {/* 列显示 */}
          <div class="frame-settings-section">
            <div class="frame-settings-section-title">列显示</div>
            <div class="frame-settings-column-grid">
              {COLUMN_META.map((col) => {
                const disabled = !!col.needsDbc && !props.hasDbc;
                return (
                  <label
                    class="frame-settings-checkbox-label"
                    classList={{ 'frame-settings-checkbox-label--disabled': disabled }}
                  >
                    <input
                      class="frame-settings-checkbox"
                      type="checkbox"
                      checked={draft().visibleColumns.includes(col.key)}
                      disabled={disabled}
                      onChange={() => toggleColumn(col.key)}
                    />
                    <span class="frame-settings-checkbox-text">{col.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div class="frame-settings-divider" />

          {/* 时间格式 */}
          <div class="frame-settings-section">
            <div class="frame-settings-section-title">时间格式</div>
            <div class="frame-settings-radio-group">
              {([
                ['absolute', '绝对时间 (时:分:秒.毫秒)'],
                ['relative-to-start', '相对于测量起始时间 (秒)'],
                ['relative-to-prev', '相对于上一帧的时间 (秒)'],
              ] as const).map(([val, label]) => (
                <label class="frame-settings-radio-label">
                  <input
                    class="frame-settings-radio"
                    type="radio"
                    name="timeFormat"
                    value={val}
                    checked={draft().timeFormat === val}
                    onChange={() => setField('timeFormat', val)}
                  />
                  <span class="frame-settings-radio-text">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div class="frame-settings-divider" />

          {/* CAN ID 格式 */}
          <div class="frame-settings-section">
            <div class="frame-settings-section-title">CAN ID 格式</div>
            <div class="frame-settings-radio-group">
              {([
                ['no-prefix', '无前缀 (7E8)'],
                ['0x-prefix', '0x 前缀 (0x7E8)'],
              ] as const).map(([val, label]) => (
                <label class="frame-settings-radio-label">
                  <input
                    class="frame-settings-radio"
                    type="radio"
                    name="canIdFormat"
                    value={val}
                    checked={draft().canIdFormat === val}
                    onChange={() => setField('canIdFormat', val)}
                  />
                  <span class="frame-settings-radio-text">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div class="frame-settings-divider" />

          {/* 行为设置 */}
          <div class="frame-settings-section">
            <div class="frame-settings-section-title">行为</div>

            <div class="frame-settings-row">
              <label class="frame-settings-toggle-label">
                <span class="frame-settings-toggle-text">自动滚动</span>
                <span class="frame-settings-toggle-desc">新帧到达时自动滚动到底部</span>
              </label>
              <label class="frame-settings-switch">
                <input
                  class="frame-settings-switch-input"
                  type="checkbox"
                  checked={draft().autoScroll}
                  onChange={(e) => setField('autoScroll', e.currentTarget.checked)}
                />
                <span class="frame-settings-switch-track" />
              </label>
            </div>

            <div class="frame-settings-row">
              <label class="frame-settings-toggle-label">
                <span class="frame-settings-toggle-text">变化字节高亮</span>
                <span class="frame-settings-toggle-desc">相邻帧变化字节短暂闪烁提示</span>
              </label>
              <label class="frame-settings-switch">
                <input
                  class="frame-settings-switch-input"
                  type="checkbox"
                  checked={draft().highlightChanges}
                  onChange={(e) => setField('highlightChanges', e.currentTarget.checked)}
                />
                <span class="frame-settings-switch-track" />
              </label>
            </div>

            <div class="frame-settings-row frame-settings-row--input">
              <label class="frame-settings-input-label" for="max-frames">最大显示帧数</label>
              <input
                id="max-frames"
                class="frame-settings__input"
                type="number"
                min={100}
                max={1000000}
                step={100}
                value={draft().maxFrames}
                onChange={(e) => {
                  const v = parseInt(e.currentTarget.value, 10);
                  if (!isNaN(v)) setField('maxFrames', Math.max(100, Math.min(1000000, v)));
                }}
              />
            </div>
          </div>
        </div>

        <div class="npd-footer">
          <button class="npd-btn npd-btn-cancel" onClick={handleReset}>
            恢复默认
          </button>
          <div style="flex: 1" />
          <button class="npd-btn npd-btn-cancel" onClick={props.onClose}>
            取消
          </button>
          <button class="npd-btn npd-btn-create" onClick={handleApply}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default FrameTableSettingsDialog;