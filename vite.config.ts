/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Hunspell dictionaries for spell check. Their packages only export a Node loader, so the
    // files are reached directly; the worker imports them as URLs and Vite fingerprints them.
    alias: {
      '@dictionaries/en-US': fileURLToPath(new URL('./node_modules/dictionary-en', import.meta.url)),
      '@dictionaries/en-GB': fileURLToPath(new URL('./node_modules/dictionary-en-gb', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely, so they get long-lived chunks. React has its own so the
        // documents list never has to download the editor engine.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return 'react';
          if (/node_modules\/(@tiptap|prosemirror-|orderedmap|rope-sequence|w3c-keyname|linkifyjs)/.test(id)) return 'editor-engine';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
