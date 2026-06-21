/// <reference types="vite/client" />

/** Build-time version string injected by vite.config.ts */
declare const __APP_VERSION__: string;

declare module '*.md?raw' {
  const content: string;
  export default content;
}
