import { defineConfig } from 'vite';

// Relative base so the built game runs from any static folder (offline preview).
export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['tests/unit/**/*.test.ts'], testTimeout: 120000 },
});
