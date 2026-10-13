import { lazy, Suspense, useEffect } from 'react';
import { Route, Switch } from 'wouter';
import { MotionConfig } from 'motion/react';
import { useApp } from '../store/app';
import { device } from './perf';

const Workspace = lazy(() => import('../features/workspace/Workspace'));
const Docs = lazy(() => import('../docs/DocsApp'));

function BootScreen() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg" role="status" aria-label="Loading CryoRadar">
      <svg width="120" height="40" viewBox="0 0 120 40" aria-hidden="true">
        <path d="M2 30h116" stroke="var(--c-line-strong)" />
        <path d="M2 20c20-14 96-14 116 0" stroke="var(--c-accent)" strokeWidth="1.5" fill="none" strokeDasharray="140" strokeDashoffset="140">
          <animate attributeName="stroke-dashoffset" from="140" to="0" dur="0.9s" repeatCount="indefinite" />
        </path>
      </svg>
    </div>
  );
}

export default function App() {
  const theme = useApp(s => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121110' : '#f2eee5');
  }, [theme]);

  return (
    <MotionConfig reducedMotion="user" transition={device.tier === 'low' ? { duration: 0 } : undefined}>
      <Suspense fallback={<BootScreen />}>
        <Switch>
          <Route path="/docs/*?" component={Docs} />
          <Route component={Workspace} />
        </Switch>
      </Suspense>
    </MotionConfig>
  );
}
