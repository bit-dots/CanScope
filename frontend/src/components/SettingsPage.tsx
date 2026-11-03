import { Component, For, Show, createEffect, onCleanup, createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { ChevronRight, SlidersHorizontal, X } from 'lucide-solid';
import MeasurementSettingsPanel from './MeasurementSettingsPanel';
import type { MeasurementSettings } from '../measurementSettings';
import type { EventLevel } from '../runtimeEvents';
import {
  RUNTIME_LOG_CACHE_LIMITS,
  RUNTIME_LOG_DISPLAY_LIMITS,
  RUNTIME_LOG_LEVELS,
  RUNTIME_LOG_TIME_FORMATS,
  formatRuntimeLogTimestamp,
  type RuntimeLogSettings,
} from '../runtimeLogSettings';

interface SettingsPageProps {
  settings: MeasurementSettings;
  runtimeLogSettings: RuntimeLogSettings;
  runtimeLogPersistenceError: string | null;
  cachedFrameCount: number;
  estimatedCacheBytes: number;
  availableMemoryBytes: number | null;
  automaticLimitBytes: number | null;
  memoryInfoError: string | null;
  onChange: (settings: MeasurementSettings) => void;
  onRuntimeLogSettingsChange: (settings: RuntimeLogSettings) => void;
  onClose: () => void;
}

const levelLabels: Record<EventLevel, string> = {
  debug: '调试',
  info: '信息',
  warning: '警告',
  error: '错误',
  critical: '严重错误',
};

const SettingsPage: Component<SettingsPageProps> = (props) => {
  const [measurementExpanded, setMeasurementExpanded] = createSignal(true);
  const [applicationExpanded, setApplicationExpanded] = createSignal(true);
  const [activeSection, setActiveSection] = createSignal<'cache' | 'logs'>('cache');
  const [logSettingsError, setLogSettingsError] = createSignal<string | null>(null);
  const timeFormatSampleTimestamp = Date.now();

  const updateLogSettings = (updates: Partial<RuntimeLogSettings>) => {
    props.onRuntimeLogSettingsChange({ ...props.runtimeLogSettings, ...updates });
  };

  const selectLogFile = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const selected = await save({
        title: '选择日志文件',
        defaultPath: props.runtimeLogSettings.filePath || 'canscope-logs.jsonl',
        filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }],
      });
      if (typeof selected === 'string') {
        updateLogSettings({ filePath: selected, saveToFile: true });
        setLogSettingsError(null);
      }
    } catch (error) {
      setLogSettingsError(`无法选择日志文件：${String(error)}`);
    }
  };

  const toggleFileLogging = (enabled: boolean, input: HTMLInputElement) => {
    if (!enabled) {
      updateLogSettings({ saveToFile: false });
      return;
    }
    if (props.runtimeLogSettings.filePath) {
      updateLogSettings({ saveToFile: true });
      return;
    }
    input.checked = false;
    void selectLogFile();
  };

  const openLogFile = async () => {
    try {
      await invoke('reveal_runtime_log_file', { path: props.runtimeLogSettings.filePath });
      setLogSettingsError(null);
    } catch (error) {
      setLogSettingsError(`无法打开日志文件位置：${String(error)}`);
    }
  };

  createEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  return (
    <div class="settings-page-overlay" onClick={props.onClose}>
      <section
        class="settings-page"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-page-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="settings-page__header">
          <h1 id="settings-page-title">
            <SlidersHorizontal size={16} />
            设置
          </h1>
          <button
            class="settings-page__close"
            type="button"
            aria-label="关闭设置"
            title="关闭"
            onClick={props.onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div class="settings-page__body">
          <nav class="settings-page__nav" aria-label="设置分类">
            <button
              class="settings-page__category"
              aria-expanded={measurementExpanded()}
              aria-controls="settings-measurement-subcategories"
              onClick={() => setMeasurementExpanded((expanded) => !expanded)}
              type="button"
            >
              <ChevronRight
                size={14}
                class="settings-page__category-icon"
                classList={{ 'settings-page__category-icon--expanded': measurementExpanded() }}
              />
              <span>测量</span>
            </button>
            <div id="settings-measurement-subcategories" hidden={!measurementExpanded()}>
              <button
                class="settings-page__subcategory"
                classList={{ 'settings-page__subcategory--active': activeSection() === 'cache' }}
                aria-current={activeSection() === 'cache' ? 'page' : undefined}
                onClick={() => setActiveSection('cache')}
                type="button"
              >
                数据缓存
              </button>
            </div>
            <button
              class="settings-page__category"
              aria-expanded={applicationExpanded()}
              aria-controls="settings-application-subcategories"
              onClick={() => setApplicationExpanded((expanded) => !expanded)}
              type="button"
            >
              <ChevronRight
                size={14}
                class="settings-page__category-icon"
                classList={{ 'settings-page__category-icon--expanded': applicationExpanded() }}
              />
              <span>应用</span>
            </button>
            <div id="settings-application-subcategories" hidden={!applicationExpanded()}>
              <button
                class="settings-page__subcategory"
                classList={{ 'settings-page__subcategory--active': activeSection() === 'logs' }}
                aria-current={activeSection() === 'logs' ? 'page' : undefined}
                onClick={() => setActiveSection('logs')}
                type="button"
              >
                日志
              </button>
            </div>
          </nav>
          <section class="settings-page__detail" aria-labelledby="settings-page-section-title">
            <Show when={activeSection() === 'cache'} fallback={
              <>
                <h2 id="settings-page-section-title" class="settings-page__heading">日志</h2>
                <div class="backstage__setting-group">
                  <label class="backstage__setting-row" for="runtime-log-display-limit">
                    <span class="backstage__setting-label">最大显示行数</span>
                    <select
                      id="runtime-log-display-limit"
                      class="runtime-log-settings__select"
                      value={props.runtimeLogSettings.displayLimit}
                      onChange={(event) => updateLogSettings({
                        displayLimit: Number(event.currentTarget.value) as RuntimeLogSettings['displayLimit'],
                      })}
                    >
                      <For each={RUNTIME_LOG_DISPLAY_LIMITS}>
                        {(limit) => <option value={limit}>{limit.toLocaleString()} 行</option>}
                      </For>
                    </select>
                  </label>
                  <fieldset class="runtime-log-settings__time-formats">
                    <legend class="backstage__setting-label">时间格式</legend>
                    <For each={RUNTIME_LOG_TIME_FORMATS}>
                      {(format) => (
                        <label
                          class="runtime-log-settings__time-format"
                          classList={{
                            'runtime-log-settings__time-format--selected':
                              props.runtimeLogSettings.timeFormat === format,
                          }}
                        >
                          <input
                            type="radio"
                            name="runtime-log-time-format"
                            value={format}
                            checked={props.runtimeLogSettings.timeFormat === format}
                            onChange={() => updateLogSettings({ timeFormat: format })}
                          />
                          <span class="runtime-log-settings__time-format-name">
                            {format === 'date-time' ? '日期与时间（本地）' : format === 'time' ? '仅时间（本地）' : 'ISO 8601（UTC）'}
                          </span>
                          <code>
                            {formatRuntimeLogTimestamp(timeFormatSampleTimestamp, format)}
                          </code>
                        </label>
                      )}
                    </For>
                  </fieldset>
                  <div class="runtime-log-settings__levels" role="group" aria-labelledby="runtime-log-levels-label">
                    <span id="runtime-log-levels-label" class="backstage__setting-label">日志等级</span>
                    <div class="runtime-log-settings__level-options">
                      <For each={RUNTIME_LOG_LEVELS}>
                        {(level) => (
                          <label>
                            <input
                              type="checkbox"
                              checked={props.runtimeLogSettings.enabledLevels.includes(level)}
                              onChange={(event) => {
                                const enabledLevels = event.currentTarget.checked
                                  ? [...props.runtimeLogSettings.enabledLevels, level]
                                  : props.runtimeLogSettings.enabledLevels.filter((enabled) => enabled !== level);
                                updateLogSettings({ enabledLevels });
                              }}
                            />
                            <span>{levelLabels[level]}</span>
                          </label>
                        )}
                      </For>
                    </div>
                  </div>
                  <label class="backstage__setting-row" for="runtime-log-cache-limit">
                    <span class="backstage__setting-label">最大缓存数量</span>
                    <select
                      id="runtime-log-cache-limit"
                      class="runtime-log-settings__select"
                      value={props.runtimeLogSettings.cacheLimit}
                      onChange={(event) => updateLogSettings({
                        cacheLimit: Number(event.currentTarget.value) as RuntimeLogSettings['cacheLimit'],
                      })}
                    >
                      <For each={RUNTIME_LOG_CACHE_LIMITS}>
                        {(limit) => <option value={limit}>{limit.toLocaleString()} 条</option>}
                      </For>
                    </select>
                  </label>
                </div>
                <p class="backstage__setting-note">
                  最大显示行数只限制面板中展示的最近日志；达到缓存上限后，会从内存中移除最早的日志。
                </p>
                <h3 class="backstage__subheading backstage__subheading--spaced">日志文件</h3>
                <label class="runtime-log-settings__file-toggle">
                  <input
                    type="checkbox"
                    checked={props.runtimeLogSettings.saveToFile}
                    onChange={(event) => toggleFileLogging(event.currentTarget.checked, event.currentTarget)}
                  />
                  <span>自动保存日志到文件</span>
                </label>
                <div class="runtime-log-settings__file-path">
                  <input
                    aria-label="日志文件路径"
                    readOnly
                    value={props.runtimeLogSettings.filePath}
                    placeholder="尚未选择日志文件"
                  />
                  <button type="button" onClick={() => void selectLogFile()}>选择路径</button>
                  <button
                    type="button"
                    disabled={!props.runtimeLogSettings.filePath}
                    onClick={() => void openLogFile()}
                  >
                    打开文件位置
                  </button>
                </div>
                <p class="backstage__setting-note">
                  开启后新日志会以 JSON Lines 格式追加写入；文件不会随内存缓存上限自动清理。清空日志面板只清空当前会话缓存，不删除文件。
                </p>
                <Show when={props.runtimeLogPersistenceError || logSettingsError()}>
                  <p class="runtime-log-settings__error" role="alert">
                    {props.runtimeLogPersistenceError ?? logSettingsError()}
                  </p>
                </Show>
              </>
            }>
              <h2 id="settings-page-section-title" class="settings-page__heading">数据缓存</h2>
              <MeasurementSettingsPanel
                settings={props.settings}
                cachedFrameCount={props.cachedFrameCount}
                estimatedCacheBytes={props.estimatedCacheBytes}
                availableMemoryBytes={props.availableMemoryBytes}
                automaticLimitBytes={props.automaticLimitBytes}
                memoryInfoError={props.memoryInfoError}
                onChange={props.onChange}
              />
            </Show>
          </section>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
