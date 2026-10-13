/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

/** Version from package.json, injected at build time. */
declare const __APP_VERSION__: string;

declare module '*.wgsl?raw' {
  const source: string;
  export default source;
}

declare module '*.md' {
  import type { ComponentType } from 'react';
  import type { MDXProps } from 'mdx/types';
  const Component: ComponentType<MDXProps>;
  export default Component;
}

/** Raw text of each docs page, keyed by file name (see vite.config.ts). */
declare module 'virtual:docs-sources' {
  const sources: Record<string, string>;
  export default sources;
}
