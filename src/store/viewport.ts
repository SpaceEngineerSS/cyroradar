/* Pan/zoom and pointer state live outside React. The radargram canvases
 * subscribe directly, so dragging the view never re-renders a component. */

import { createStore, useStore } from 'zustand';

export interface Viewport {
  /** Screen px of data origin. */
  offsetX: number;
  offsetY: number;
  /** Screen px per trace / per sample. */
  scaleX: number;
  scaleY: number;
  /** Size of the plot area in CSS px. */
  width: number;
  height: number;
}

export const viewport = createStore<Viewport>(() => ({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, width: 0, height: 0 }));

export function fitViewport(dataWidth: number, dataHeight: number, width = viewport.getState().width, height = viewport.getState().height) {
  if (!(width > 0 && height > 0 && dataWidth > 0 && dataHeight > 0)) return;
  viewport.setState({ offsetX: 0, offsetY: 0, scaleX: width / dataWidth, scaleY: height / dataHeight, width, height });
}

export function zoomAt(px: number, py: number, fx: number, fy: number) {
  const v = viewport.getState();
  const scaleX = Math.min(200, Math.max(1e-3, v.scaleX * fx));
  const scaleY = Math.min(200, Math.max(1e-3, v.scaleY * fy));
  viewport.setState({
    scaleX,
    scaleY,
    offsetX: px - ((px - v.offsetX) * scaleX) / v.scaleX,
    offsetY: py - ((py - v.offsetY) * scaleY) / v.scaleY,
  });
}

export function panBy(dx: number, dy: number) {
  const v = viewport.getState();
  viewport.setState({ offsetX: v.offsetX + dx, offsetY: v.offsetY + dy });
}

/** Trace and (displayed) sample under the pointer, or null when it is outside the plot. */
export interface Cursor {
  trace: number;
  row: number;
}

export const cursor = createStore<{ hover: Cursor | null }>(() => ({ hover: null }));

export const useHover = () => useStore(cursor, s => s.hover);
