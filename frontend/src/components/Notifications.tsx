import { Component, For, Show } from 'solid-js';
import { Trash2, X } from 'lucide-solid';
import type { AppNotification, EventLevel } from '../runtimeEvents';
import './Notifications.css';

interface NotificationsProps {
  entries: AppNotification[];
  open: boolean;
  onClose: () => void;
  onDismiss: (id: number) => void;
  onClear: () => void;
}

const labels: Record<EventLevel, string> = {
  error: '错误',
  warning: '警告',
  info: '信息',
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, { hour12: false });

const Notifications: Component<NotificationsProps> = (props) => {
  const toasts = () => props.entries.filter((entry) => entry.toastActive).slice(0, 4);
  const unreadCount = () => props.entries.filter((entry) => !entry.read).length;

  return (
    <>
      <div class="notification-toasts" aria-live="polite">
        <For each={toasts()}>
          {(entry) => (
            <article
              class={`notification-toast notification-toast--${entry.level}`}
              role={entry.level === 'error' ? 'alert' : 'status'}
            >
              <div class="notification-toast__content">
                <span class="notification-toast__level">{labels[entry.level]} · {entry.source}</span>
                <strong>{entry.message}</strong>
                <Show when={entry.details}><span>{entry.details}</span></Show>
              </div>
              <button type="button" aria-label="关闭通知" onClick={() => props.onDismiss(entry.id)}>
                <X size={14} />
              </button>
            </article>
          )}
        </For>
      </div>
      <Show when={props.open}>
        <section class="notification-inbox" aria-label="通知中心">
          <header class="notification-inbox__header">
            <strong>通知</strong>
            <div>
              <button type="button" title="清空通知" aria-label="清空通知" onClick={props.onClear}>
                <Trash2 size={14} />
              </button>
              <button type="button" title="关闭通知中心" aria-label="关闭通知中心" onClick={props.onClose}>
                <X size={15} />
              </button>
            </div>
          </header>
          <div class="notification-inbox__list">
            <Show when={props.entries.length > 0} fallback={<div class="notification-inbox__empty">没有通知</div>}>
              <For each={props.entries}>
                {(entry) => (
                  <article class="notification-item" classList={{
                    'notification-item--unread': !entry.read,
                    [`notification-item--${entry.level}`]: true,
                  }}>
                    <div class="notification-item__top">
                      <span>{labels[entry.level]} · {entry.source}</span>
                      <time>{formatTime(entry.timestamp)}</time>
                    </div>
                    <strong>{entry.message}</strong>
                    <Show when={entry.details}><p>{entry.details}</p></Show>
                    <button
                      type="button"
                      class="notification-item__dismiss"
                      aria-label="移除此通知"
                      onClick={() => props.onDismiss(entry.id)}
                    >
                      <X size={13} />
                    </button>
                  </article>
                )}
              </For>
            </Show>
          </div>
          <footer class="notification-inbox__footer">
            {unreadCount() > 0 ? `${unreadCount()} 条未读` : '通知已读'}
          </footer>
        </section>
      </Show>
    </>
  );
};

export default Notifications;
