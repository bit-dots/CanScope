import type { Component } from 'solid-js';
import { cacheMemoryLimitBytes, type MeasurementSettings } from '../measurementSettings';

interface MeasurementSettingsPanelProps {
  settings: MeasurementSettings;
  cachedFrameCount: number;
  estimatedCacheBytes: number;
  availableMemoryBytes: number | null;
  automaticLimitBytes: number | null;
  memoryInfoError: string | null;
  onChange: (settings: MeasurementSettings) => void;
}

const MeasurementSettingsPanel: Component<MeasurementSettingsPanelProps> = (props) => (
  <>
    <h3 class="backstage__subheading">内存使用</h3>
    <label class="backstage__setting-radio backstage__memory-auto">
      <input
        type="checkbox"
        checked={props.settings.automaticMemoryLimit}
        onChange={(event) => props.onChange({
          ...props.settings,
          automaticMemoryLimit: event.currentTarget.checked,
        })}
      />
      <span>根据系统可用内存自动计算</span>
    </label>
    <div class="backstage__setting-row">
      <label for="cache-memory-limit">自定义:</label>
      <div class="backstage__memory-input">
        <input
          id="cache-memory-limit"
          type="number"
          min={1}
          max={1048576}
          step={128}
          value={props.settings.customMemoryLimitMb}
          disabled={props.settings.automaticMemoryLimit}
          onChange={(event) => {
            const value = Number.parseInt(event.currentTarget.value, 10);
            if (Number.isFinite(value)) {
              props.onChange({
                ...props.settings,
                customMemoryLimitMb: Math.max(1, Math.min(1048576, value)),
              });
            }
          }}
        />
        <span>MB</span>
      </div>
    </div>
    <div class="backstage__cache-stats">
      <span>
        可用内存：{props.availableMemoryBytes === null
          ? '不可用'
          : `${(props.availableMemoryBytes / (1024 * 1024)).toFixed(0)} MB`}
      </span>
      <span>
        缓存上限：{(cacheMemoryLimitBytes(
          props.settings,
          props.automaticLimitBytes,
        ) / (1024 * 1024)).toFixed(0)} MB
      </span>
    </div>
    {props.settings.automaticMemoryLimit && props.availableMemoryBytes !== null && (
      <p class="backstage__setting-note">
        自动上限在打开设置或启用此选项时，按当时可用内存的一半计算；可用内存每 5 秒刷新。
      </p>
    )}
    {props.memoryInfoError && (
      <p class="backstage__setting-note">
        无法读取系统可用内存，自动上限无法刷新，当前沿用最近一次计算值或自定义值。
      </p>
    )}
    {!props.memoryInfoError && props.settings.automaticMemoryLimit && props.availableMemoryBytes === null && (
      <p class="backstage__setting-note">
        当前平台未提供可用内存信息，自动上限暂按自定义值执行。
      </p>
    )}
    <h3 class="backstage__subheading backstage__subheading--spaced">数据缓存设置</h3>
    <p class="backstage__desc">
      此缓存只控制报文监控界面，不会删除原始录制文件或磁盘索引。
    </p>
    <div class="backstage__cache-stats">
      <span>
        当前缓存帧数：{props.cachedFrameCount.toLocaleString()}
      </span>
      <span>
        缓存估算：{(props.estimatedCacheBytes / (1024 * 1024)).toFixed(1)} MB
      </span>
    </div>
    <p class="backstage__setting-note">
      上限约束报文监控缓存，按报文和解码信号对象的估算内存执行，不代表应用进程总内存。
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
      缓存达到上限时，无论是否正在查看历史，都会按所选策略处理；淘汰或清空后，监控视图会定位到当前保留数据的起点。
    </p>
    <p class="backstage__setting-note">
      回放的停止策略会在当前批次处理后暂停；超出缓存预算的报文不会保留在监控缓存中。实时测量停止策略会在实时采集数据源接入后生效。
    </p>
  </>
);

export default MeasurementSettingsPanel;
