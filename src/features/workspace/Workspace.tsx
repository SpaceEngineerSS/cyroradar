import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useApp } from '../../store/app';
import { TopBar } from './TopBar';
import { Rail, BottomBar } from './Rail';
import { DockedInspector, DrawerInspector, SheetInspector } from './Inspector';
import { MainArea } from './MainArea';
import { StatusBar } from './StatusBar';
import { Toasts } from './Toasts';
import { CommandPalette, ShortcutsSheet } from '../palette/CommandPalette';
import { handleShortcut } from '../palette/commands';
import { useIsDesktop, useIsPhone } from './useMedia';
import { useUrlState } from './url-state';

export default function Workspace() {
  const desktop = useIsDesktop();
  const phone = useIsPhone();
  const [, navigate] = useLocation();
  useUrlState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleShortcut(e, navigate)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Phones and tablets start with the plot visible; the panel opens on demand.
  useEffect(() => {
    if (!desktop) useApp.getState().set('inspectorOpen', false);
  }, [desktop]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a href="#main-view" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-raised focus:px-2 focus:py-1">
        Skip to the plot
      </a>
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        {!phone && <Rail />}
        {desktop && <DockedInspector />}
        <div id="main-view" className="relative flex min-w-0 flex-1 flex-col">
          <MainArea />
          {!desktop && !phone && <DrawerInspector />}
          {phone && <SheetInspector />}
        </div>
      </div>
      {!phone && <StatusBar />}
      {phone && <BottomBar />}
      <Toasts />
      <CommandPalette />
      <ShortcutsSheet />
    </div>
  );
}
