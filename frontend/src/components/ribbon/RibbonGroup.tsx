import { Component, JSX } from 'solid-js';
import './Ribbon.css';

export interface RibbonGroupProps {
  label: string;
  children: JSX.Element;
}

const RibbonGroup: Component<RibbonGroupProps> = (props) => {
  return (
    <div class="ribbon-group">
      <div class="ribbon-group__content">
        {props.children}
      </div>
      <span class="ribbon-group__label">{props.label}</span>
    </div>
  );
};

export default RibbonGroup;