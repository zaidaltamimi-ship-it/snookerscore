import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',            // relative paths — required inside the Android WebView
  build: {
    outDir: 'dist',
    target: 'es2019'     // safe floor for older Android WebViews
  }
});
