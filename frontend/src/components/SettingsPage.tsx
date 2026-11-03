import { Component, For, Show, createEffect, onCleanup, createSignal } from 'solid-js';
import { ChevronRight, SlidersHorizontal, X } from 'lucide-solid';
import MeasurementSettingsPanel from './MeasurementSettingsPanel';
import type { MeasurementSettings } from '../measurementSettings';
import { RUNTIME_LOG_LIMITS, type RuntimeLogLimit } from '../runtimeLogSettings';

interface SettingsPageProps {
  settings: MeasurementSettings;
  runtimeLogLimit: RuntimeLogLimit;
  cachedFrameCount: number;
  estimatedCacheBytes: number;
  availableMemoryBytes: number | null;
  automaticLimitBytes: number | null;
  memoryInfoError: string | null;
  onChange: (settings: MeasurementSettings) => void;
  onRuntimeLogLimitChange: (limit: RuntimeLogLimit) => void;
  onClose: () => void;
}

const SettingsPage: Component<SettingsPageProps> = (props) => {
  const [measurementExpanded, setMeasurementExpanded] = createSignal(true);
  const [applicationExpanded, setApplicationExpanded] = createSignal(true);
  const [activeSection, setActiveSection] = createSignal<'cache' | 'logs'>('cache');

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
                  <label class="backstage__setting-row" for="runtime-log-limit">
                    <span class="backstage__setting-label">当前会话日志上限</span>
                    <select
                      id="runtime-log-limit"
                      class="runtime-log-settings__select"
                      value={props.runtimeLogLimit}
                      onChange={(event) => props.onRuntimeLogLimitChange(
                        Number(event.currentTarget.value) as RuntimeLogLimit,
                      )}
                    >
                      <For each={RUNTIME_LOG_LIMITS}>
                        {(limit) => <option value={limit}>{limit.toLocaleString()} 条</option>}
                      </For>
                    </select>
                  </label>
                </div>
                <p class="backstage__setting-note">
                  达到上限后，自动移除最早的日志。日志仅保留在当前运行会话，不会自动写入磁盘；需要长期留存时，可在日志面板中导出。
                </p>
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
