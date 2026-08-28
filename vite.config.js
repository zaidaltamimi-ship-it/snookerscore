import { defineConfig } from 'vite';

export default defineConfig({
  base: './',            // relative paths — required inside the Android WebView
  build: {
    outDir: 'dist',
    target: 'es2019',    // safe floor for older Android WebViews
    assetsInlineLimit: 0
  }
});
