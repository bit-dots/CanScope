import { render } from 'solid-js/web';
import { PanelPopout } from './PanelPopout';
import '../index.css';

const params = new URLSearchParams(window.location.search);
const panelId = params.get('panelId') ?? '';

render(() => <PanelPopout panelId={panelId} />, document.getElementById('popout-root')!);