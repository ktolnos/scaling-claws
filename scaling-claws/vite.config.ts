import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    assetsInlineLimit: 100000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8000,
  }
});
