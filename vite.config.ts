import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed port during development.
export default defineConfig({
  plugins: [react()],
  // Relative paths so the build also works as a single folder (Tauri, previews).
  base: './',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: 'es2021', sourcemap: false, chunkSizeWarningLimit: 2000 },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
} as any);
