import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// A broken vercel.json fails the deployment without failing the build, so check it here.
describe('vercel.json', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8')) as {
    rewrites: { source: string; destination: string }[];
  };

  it('proxies PDS files and falls back to the app shell', () => {
    expect(config.rewrites[0]).toEqual({ source: '/pds-data/:match*', destination: 'https://pds-geosciences.wustl.edu/:match*' });
    expect(config.rewrites.at(-1)?.destination).toBe('/index.html');
  });

  it('does not answer missing build assets with the app shell', () => {
    const fallback = new RegExp(`^${config.rewrites.at(-1)!.source}$`);
    expect(fallback.test('/docs/physics')).toBe(true);
    expect(fallback.test('/assets/missing.js')).toBe(false);
    expect(fallback.test('/pds-data/mro/x.tif')).toBe(false);
  });
});
