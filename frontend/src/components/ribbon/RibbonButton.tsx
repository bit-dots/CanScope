import { Component, JSX } from 'solid-js';
import './Ribbon.css';

export interface RibbonButtonProps {
  icon: JSX.Element;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  dropdown?: boolean;
}

const RibbonButton: Component<RibbonButtonProps> = (props) => {
  return (
    <button
      class="ribbon-button"
      classList={{
        'ribbon-button--active': props.active,
        'ribbon-button--disabled': props.disabled,
        'ribbon-button--dropdown': props.dropdown,
      }}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      type="button"
    >
      <span class="ribbon-button__icon">{props.icon}</span>
      <span class="ribbon-button__label">{props.label}</span>
      {props.dropdown && <span class="ribbon-button__arrow">&#9660;</span>}
    </button>
  );
};

export default RibbonButton;