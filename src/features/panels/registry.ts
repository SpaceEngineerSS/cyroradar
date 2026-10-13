/* Inspector panels: label, icon and a lazy loader for each. Only the panel you
 * open is downloaded. */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IconName } from '../../ui/icons';
import type { PanelId } from '../../store/app';
import type { ViewMode } from '../../types/types';

interface PanelDef {
  id: PanelId;
  label: string;
  icon: IconName;
  component: LazyExoticComponent<ComponentType>;
}

const def = (id: PanelId, label: string, icon: IconName, load: () => Promise<{ default: ComponentType }>): PanelDef => ({
  id,
  label,
  icon,
  component: lazy(load),
});

export const PANELS: Record<PanelId, PanelDef> = {
  tour: def('tour', 'Guided tour', 'tour', () => import('./TourPanel')),
  data: def('data', 'Data', 'data', () => import('./DataPanel')),
  view: def('view', 'Display', 'view', () => import('./ViewPanel')),
  processing: def('processing', 'Processing', 'processing', () => import('./ProcessingPanel')),
  layers: def('layers', 'Depth model', 'layers', () => import('./LayersPanel')),
  detect: def('detect', 'Detection', 'detect', () => import('./DetectPanel')),
  uncertainty: def('uncertainty', 'Uncertainty', 'uncertainty', () => import('./UncertaintyPanel')),
  polarimetry: def('polarimetry', 'Polarimetry', 'polarimetry', () => import('./PolarimetryPanel')),
  inversion: def('inversion', 'Inversion', 'inversion', () => import('./InversionPanel')),
  log: def('log', 'Log', 'log', () => import('./LogPanel')),
  budget: def('budget', 'Link budget', 'budget', () => import('./BudgetPanel')),
};

export const RAIL: Record<ViewMode, PanelId[]> = {
  explorer: ['tour', 'data', 'view', 'detect', 'log'],
  analyst: ['data', 'view', 'processing', 'layers', 'detect', 'uncertainty', 'polarimetry', 'inversion', 'log', 'budget'],
};
