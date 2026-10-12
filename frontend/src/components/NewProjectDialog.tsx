import { Component, createSignal, createMemo, onMount } from 'solid-js';

export interface NewProjectConfig {
  name: string;
  parentFolder: string;
  createSubfolder: boolean;
}

interface NewProjectDialogProps {
  onConfirm: (config: NewProjectConfig) => void;
  onCancel: () => void;
}

const NewProjectDialog: Component<NewProjectDialogProps> = (props) => {
  const [projectName, setProjectName] = createSignal('');
  const [parentFolder, setParentFolder] = createSignal('');
  const [createSubfolder, setCreateSubfolder] = createSignal(true);

  onMount(async () => {
    try {
      const { documentDir } = await import('@tauri-apps/api/path');
      const dir = await documentDir();
      setParentFolder(dir);
    } catch {
      setParentFolder('');
    }
  });

  const displayPath = createMemo(() => {
    const name = projectName().trim() || 'Untitled';
    const parent = parentFolder();
    if (!parent) return name + '.canscope';

    const sep = parent.includes('\\') ? '\\' : '/';
    const dir = parent.endsWith(sep) ? parent : parent + sep;
    if (createSubfolder()) {
      return dir + name + sep + name + '.canscope';
    }
    return dir + name + '.canscope';
  });

  const canConfirm = () => projectName().trim().length > 0 && parentFolder().length > 0;

  const handleBrowse = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: 'Select Parent Folder',
        directory: true,
      });
      if (selected && typeof selected === 'string') {
        setParentFolder(selected);
      }
    } catch {
      // dialog cancelled
    }
  };

  const handleConfirm = () => {
    if (!canConfirm()) return;
    props.onConfirm({
      name: projectName().trim() || 'Untitled',
      parentFolder: parentFolder(),
      createSubfolder: createSubfolder(),
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && canConfirm()) {
      handleConfirm();
    }
    if (e.key === 'Escape') {
      props.onCancel();
    }
  };

  return (
    <div class="npd-overlay" onClick={props.onCancel}>
      <div class="npd-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div class="npd-header">
          <h2 class="npd-title">New Project</h2>
          <button class="npd-close" onClick={props.onCancel}>&#x2715;</button>
        </div>

        <div class="npd-body">
          <div class="npd-field">
            <label class="npd-label" for="npd-name">
              Project Name <span class="npd-required">*</span>
            </label>
            <input
              id="npd-name"
              class="npd-input"
              type="text"
              placeholder="e.g. CAN Bus Analysis Q3"
              value={projectName()}
              onInput={(e) => setProjectName(e.currentTarget.value)}
              autofocus
            />
          </div>

          <div class="npd-field">
            <label class="npd-label" for="npd-folder">
              Parent Folder
            </label>
            <div class="npd-folder-row">
              <input
                id="npd-folder"
                class="npd-input npd-folder-input"
                type="text"
                placeholder="Select a folder..."
                value={parentFolder()}
                onInput={(e) => setParentFolder(e.currentTarget.value)}
                readonly
              />
              <button class="npd-browse-btn" onClick={handleBrowse}>
                Browse
              </button>
            </div>
          </div>

          <div class="npd-field npd-checkbox-field">
            <label class="npd-checkbox-label">
              <input
                type="checkbox"
                class="npd-checkbox"
                checked={createSubfolder()}
                onChange={(e) => setCreateSubfolder(e.currentTarget.checked)}
              />
              <span class="npd-checkbox-text">
                Create a subfolder for this project
              </span>
            </label>
          </div>

          <div class="npd-preview">
            <div class="npd-preview-label">
              {createSubfolder() ? (
                <>
                  A new folder will be created at:
                </>
              ) : (
                <>
                  Project file will be saved as:
                </>
              )}
            </div>
            <code class="npd-preview-path">{displayPath()}</code>
          </div>
        </div>

        <div class="npd-footer">
          <button class="npd-btn npd-btn-cancel" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            class="npd-btn npd-btn-create"
            onClick={handleConfirm}
            disabled={!canConfirm()}
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewProjectDialog;