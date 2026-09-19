import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const appRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: appRoot,
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../studenthub', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false
  }
});
