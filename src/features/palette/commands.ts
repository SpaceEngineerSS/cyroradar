/* Everything the command palette and keyboard shortcuts can do. */

import { useApp, type PanelId } from '../../store/app';
import { listSyntheticScenes } from '../../core/pipeline/synthetic-generator';
import { getAllColormaps } from '../../core/colormaps/colormaps';
import { fitViewport } from '../../store/viewport';
import { PANELS } from '../panels/registry';
import type { IconName } from '../../ui/icons';
import { capturePlot } from '../../core/export/capture';

export interface Command {
  id: string;
  title: string;
  group: string;
  icon?: IconName;
  shortcut?: string;
  run: () => void;
}

export function buildCommands(navigate: (to: string) => void): Command[] {
  const s = useApp.getState();
  const openPanel = (id: PanelId) => () => {
    s.set('panel', id);
    s.set('inspectorOpen', true);
  };
  const cmds: Command[] = [];

  for (const scene of listSyntheticScenes())
    cmds.push({ id: `scene:${scene.id}`, group: 'Open', title: `${scene.title} (simulated ${scene.instrument})`, icon: 'radargram', run: () => void s.loadSynthetic(scene.id) });
  cmds.push({ id: 'pds', group: 'Open', title: 'Search the NASA PDS archive', icon: 'search', run: openPanel('data') });

  for (const p of Object.values(PANELS)) cmds.push({ id: `panel:${p.id}`, group: 'Panels', title: p.label, icon: p.icon, run: openPanel(p.id) });

  cmds.push(
    { id: 'view:radargram', group: 'Views', title: 'Radargram', icon: 'radargram', shortcut: '1', run: () => s.set('mainView', 'radargram') },
    { id: 'view:ascope', group: 'Views', title: 'A-scope', icon: 'ascope', shortcut: '2', run: () => s.set('mainView', 'ascope') },
    { id: 'view:map', group: 'Views', title: 'Track map', icon: 'map', shortcut: '3', run: () => s.set('mainView', 'map') },
    { id: 'view:scene', group: 'Views', title: '3D scene', icon: 'scene', shortcut: '4', run: () => s.set('mainView', 'scene') },
    { id: 'tool:pan', group: 'Tools', title: 'Pan and select', icon: 'pan', shortcut: 'V', run: () => s.set('tool', 'pan') },
    { id: 'tool:pick', group: 'Tools', title: 'Pick a horizon', icon: 'pick', shortcut: 'P', run: () => s.set('tool', 'pick') },
    { id: 'tool:measure', group: 'Tools', title: 'Measure', icon: 'measure', shortcut: 'M', run: () => s.set('tool', 'measure') },
    { id: 'tool:roi', group: 'Tools', title: 'Select a region for inversion', icon: 'roi', shortcut: 'R', run: () => s.set('tool', 'roi') },
    { id: 'fit', group: 'Tools', title: 'Fit radargram to view', icon: 'fit', shortcut: '0', run: () => s.dataset && fitViewport(s.dataset.radargram.width, s.dataset.radargram.height) },
    { id: 'scan', group: 'Analysis', title: 'Scan for bright reflections', icon: 'detect', run: () => void s.runScan() },
    { id: 'migrate', group: 'Analysis', title: 'Run migration', icon: 'migrate', run: () => s.runMigration() },
    { id: 'statics', group: 'Analysis', title: 'Toggle static correction', icon: 'statics', run: () => s.set('statics', !useApp.getState().statics) },
    { id: 'capture', group: 'Export', title: 'Save radargram as PNG', icon: 'download', run: () => void capturePlot().catch(e => s.notify(String(e.message ?? e), 'error')) },
    { id: 'theme', group: 'Settings', title: 'Switch light / dark theme', icon: 'sun', run: () => s.set('theme', useApp.getState().theme === 'dark' ? 'light' : 'dark') },
    { id: 'mode', group: 'Settings', title: 'Switch Explore / Analyse mode', icon: 'tour', run: () => s.set('mode', useApp.getState().mode === 'explorer' ? 'analyst' : 'explorer') },
    { id: 'tour', group: 'Help', title: 'Start the guided tour', icon: 'tour', run: () => { s.set('mode', 'explorer'); openPanel('tour')(); } },
    { id: 'shortcuts', group: 'Help', title: 'Keyboard shortcuts', icon: 'keyboard', shortcut: '?', run: () => s.set('shortcutsOpen', true) },
    { id: 'docs', group: 'Help', title: 'Open the documentation', icon: 'docs', run: () => navigate('/docs') },
  );

  for (const c of getAllColormaps()) cmds.push({ id: `cmap:${c.id}`, group: 'Colour', title: `Colour table: ${c.name}`, run: () => s.set('colormap', c.id) });

  return cmds;
}

/** Single-key shortcuts, active when focus is not in a text field. */
export function handleShortcut(e: KeyboardEvent, navigate: (to: string) => void): boolean {
  const s = useApp.getState();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    s.set('paletteOpen', !s.paletteOpen);
    return true;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return false;
  const map: Record<string, () => void> = {
    v: () => s.set('tool', 'pan'),
    p: () => s.set('tool', 'pick'),
    m: () => s.set('tool', 'measure'),
    r: () => s.set('tool', 'roi'),
    '1': () => s.set('mainView', 'radargram'),
    '2': () => s.set('mainView', 'ascope'),
    '3': () => s.set('mainView', 'map'),
    '4': () => s.set('mainView', 'scene'),
    '?': () => s.set('shortcutsOpen', true),
    '/': () => s.set('paletteOpen', true),
    d: () => navigate('/docs'),
  };
  const fn = map[e.key.toLowerCase()] ?? map[e.key];
  if (!fn) return false;
  fn();
  return true;
}
