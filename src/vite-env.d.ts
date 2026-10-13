/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

/** Version from package.json, injected at build time. */
declare const __APP_VERSION__: string;

declare module '*.wgsl?raw' {
  const source: string;
  export default source;
}
