import { Component, createSignal, For, JSX } from 'solid-js';
import './Ribbon.css';

interface BackstageMenuItem {
  id: string;
  label: string;
  danger?: boolean;
}

const MENU_ITEMS: BackstageMenuItem[] = [
  { id: 'new', label: '新建' },
  { id: 'open', label: '打开' },
  { id: 'save', label: '保存' },
  { id: 'saveas', label: '另存为' },
  { id: 'import', label: '导入' },
  { id: 'export', label: '导出' },
  { id: 'options', label: '选项' },
  { id: 'exit', label: '退出', danger: true },
];

export interface BackstageProps {
  visible: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onCloseProject: () => void;
  projectLoaded: boolean;
  children?: JSX.Element;
}

const Backstage: Component<BackstageProps> = (props) => {
  const [activeItem, setActiveItem] = createSignal('new');

  const handleItemClick = (item: BackstageMenuItem) => {
    setActiveItem(item.id);

    switch (item.id) {
      case 'new':
        props.onNewProject();
        props.onClose();
        break;
      case 'open':
        props.onOpenProject();
        props.onClose();
        break;
      case 'save':
        if (props.projectLoaded) props.onSaveProject();
        break;
      case 'saveas':
        if (props.projectLoaded) props.onSaveProjectAs();
        break;
      case 'exit':
        props.onCloseProject();
        props.onClose();
        break;
      // import, export, options are placeholders
      default:
        break;
    }
  };

  return (
    <div class="backstage" classList={{ 'backstage--visible': props.visible }}>
      <div class="backstage__header">
        <button class="backstage__back" onClick={props.onClose} type="button">
          &#8592; 返回
        </button>
        <span class="backstage__title">CanScope</span>
      </div>
      <div class="backstage__body">
        <nav class="backstage__nav">
          <For each={MENU_ITEMS}>
            {(item) => (
              <button
                class="backstage__nav-item"
                classList={{
                  'backstage__nav-item--active': activeItem() === item.id,
                  'backstage__nav-item--danger': item.danger,
                }}
                onClick={() => handleItemClick(item)}
                type="button"
              >
                {item.label}
              </button>
            )}
          </For>
        </nav>
        <div class="backstage__content">
          {props.children || (
            <div class="backstage__content-placeholder">
              <For each={MENU_ITEMS}>
                {(item) => (
                  <span style={{ display: activeItem() === item.id ? 'block' : 'none' }}>
                    {item.label === '新建' && '创建新的 CanScope 工程...'}
                    {item.label === '打开' && '打开已有工程文件...'}
                    {item.label === '保存' && '保存当前工程...'}
                    {item.label === '另存为' && '将当前工程保存为新文件...'}
                    {item.label === '导入' && '导入 ASC / CSV / BLF / DBC 文件...'}
                    {item.label === '导出' && '导出为 ASC / CSV / BLF 格式...'}
                    {item.label === '选项' && '应用设置（语言、主题、数据目录等）'}
                    {item.label === '退出' && '关闭当前工程并退出'}
                  </span>
                )}
              </For>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Backstage;