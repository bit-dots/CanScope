import { Component, createEffect, onCleanup, createSignal } from 'solid-js';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-solid';
import MeasurementSettingsPanel from './MeasurementSettingsPanel';
import type { MeasurementSettings } from '../measurementSettings';

interface SettingsPageProps {
  settings: MeasurementSettings;
  cachedFrameCount: number;
  estimatedCacheBytes: number;
  onChange: (settings: MeasurementSettings) => void;
  onClose: () => void;
}

const SettingsPage: Component<SettingsPageProps> = (props) => {
  const [measurementExpanded, setMeasurementExpanded] = createSignal(true);

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
              <span>测量</span>
              <ChevronDown
                size={14}
                class="settings-page__category-icon"
                classList={{ 'settings-page__category-icon--collapsed': !measurementExpanded() }}
              />
            </button>
            <div id="settings-measurement-subcategories" hidden={!measurementExpanded()}>
              <button
                class="settings-page__subcategory settings-page__subcategory--active"
                aria-current="page"
                type="button"
              >
                数据缓存
              </button>
            </div>
          </nav>
          <section class="settings-page__detail" aria-labelledby="settings-page-section-title">
            <h2 id="settings-page-section-title" class="settings-page__heading">数据缓存</h2>
            <MeasurementSettingsPanel
              settings={props.settings}
              cachedFrameCount={props.cachedFrameCount}
              estimatedCacheBytes={props.estimatedCacheBytes}
              onChange={props.onChange}
            />
          </section>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
