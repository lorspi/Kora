import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {readFileSync} from 'fs';

// Embed the build version so the app can detect stale SW caches at runtime
const APP_VERSION = readFileSync('public/version.txt', 'utf-8').trim();

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 2200,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('/react/')) {
                return 'vendor-react';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('jszip')) {
                return 'vendor-jszip';
              }
              if (id.includes('zustand')) {
                return 'vendor-zustand';
              }
              if (id.includes('cytoscape')) {
                return 'vendor-cytoscape';
              }
              if (id.includes('katex')) {
                return 'vendor-katex';
              }
              if (id.includes('elkjs') || id.includes('elk-worker')) {
                return 'vendor-elk';
              }
              if (id.includes('d3-') || id.includes('/d3/')) {
                return 'vendor-d3';
              }
              if (id.includes('dagre') || id.includes('graphlib')) {
                return 'vendor-dagre';
              }
              if (id.includes('mermaid')) {
                return 'vendor-mermaid';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      host: "::",
      port: 8080,
      allowedHosts: ["test.lorspi.com"],
    },
  };
});
