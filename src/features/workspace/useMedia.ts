import { useSyncExternalStore } from 'react';

/** Subscribes to a media query. */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    cb => {
      const m = matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMedia('(min-width: 1024px)');
export const useIsPhone = () => useMedia('(max-width: 639px)');
