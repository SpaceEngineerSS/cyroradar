import { defineConfig } from 'vitest/config';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// PDS product files are not served with CORS headers, so they go through a
// same-origin proxy: here in development and preview, vercel.json in production.
const proxy: Record<string, ProxyOptions> = {
  '/pds-data': {
    target: 'https://pds-geosciences.wustl.edu',
    changeOrigin: true,
    secure: true,
    rewrite: path => path.replace(/^\/pds-data/, ''),
  },
};

export default defineConfig({
  plugins: [
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm, remarkMath], rehypePlugins: [rehypeKatex], providerImportSource: undefined }) },
    react({ include: /\.(mdx|tsx|ts)$/ }),
    tailwindcss(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: {
    format: 'es',
  },
  server: { proxy },
  preview: { proxy },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts', 'src/core/analysis/fwi/webgpu.ts', 'src/core/export/**'],
      reporter: ['text', 'html'],
    },
  },
});
