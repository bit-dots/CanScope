import type { Component } from 'solid-js';
import type { MeasurementSettings } from '../measurementSettings';

interface MeasurementSettingsPanelProps {
  settings: MeasurementSettings;
  cachedFrameCount: number;
  estimatedCacheBytes: number;
  onChange: (settings: MeasurementSettings) => void;
}

const MeasurementSettingsPanel: Component<MeasurementSettingsPanelProps> = (props) => (
  <>
    <h3 class="backstage__subheading">数据缓存</h3>
    <p class="backstage__desc">
      此缓存只控制报文监控界面，不会删除原始录制文件或磁盘索引。
    </p>
    <div class="backstage__setting-row">
      <label for="cache-frame-limit">最大缓存帧数</label>
      <input
        id="cache-frame-limit"
        type="number"
        min={100}
        max={1000000}
        step={1000}
        value={props.settings.maxCachedFrames}
        onChange={(event) => {
          const value = Number.parseInt(event.currentTarget.value, 10);
          if (Number.isFinite(value)) {
            props.onChange({
              ...props.settings,
              maxCachedFrames: Math.max(100, Math.min(1000000, value)),
            });
          }
        }}
      />
    </div>
    <div class="backstage__cache-stats">
      <span>
        当前缓存帧数：{props.cachedFrameCount.toLocaleString()} / {props.settings.maxCachedFrames.toLocaleString()}
      </span>
      <span>
        监控缓存估算：{(props.estimatedCacheBytes / (1024 * 1024)).toFixed(1)} MB
      </span>
    </div>
    <p class="backstage__setting-note">
      内存值是基于报文和解码信号对象的近似估算，不代表应用总内存；帧数上限是实际硬限制。
    </p>
    <div class="backstage__setting-group">
      <div class="backstage__setting-label">缓存达到上限时</div>
      {([
        ['evict-oldest', '删除最旧数据并持续接收'],
        ['clear-all', '清空全部历史，再从新数据继续累积'],
        ['stop-measurement', '停止测量；数据回放时暂停播放'],
      ] as const).map(([policy, label]) => (
        <label class="backstage__setting-radio">
          <input
            type="radio"
            name="cache-full-policy"
            checked={props.settings.cacheFullPolicy === policy}
            onChange={() => props.onChange({
              ...props.settings,
              cacheFullPolicy: policy,
            })}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
    <p class="backstage__setting-note">
      关闭自动滚动并查看历史时，监控视图会冻结并统计未显示的新报文；该行为优先于自动淘汰，避免历史内容移动。
    </p>
    <p class="backstage__setting-note">
      当前回放达到上限时会按所选策略处理；实时测量停止策略会在实时采集数据源接入后生效。
    </p>
  </>
);

export default MeasurementSettingsPanel;
