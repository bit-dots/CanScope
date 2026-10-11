import { Component } from 'solid-js';

interface TimelineProps {
  duration: number | null;
  currentTime: number;
  onSeek: (timestamp: number) => void;
  disabled: boolean;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return seconds.toFixed(3) + 's';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(1)}s`;
}

const Timeline: Component<TimelineProps> = (props) => {
  if (!props.duration || props.duration <= 0) return null;

  return (
    <div class="timeline-bar">
      <span class="timeline-time">{formatTime(props.currentTime)}</span>
      <input
        class="timeline-slider"
        type="range"
        min="0"
        max={props.duration!}
        step="0.001"
        value={props.currentTime}
        onInput={e => props.onSeek(parseFloat(e.currentTarget.value))}
        disabled={props.disabled}
      />
      <span class="timeline-time">{formatTime(props.duration!)}</span>
    </div>
  );
};

export default Timeline;