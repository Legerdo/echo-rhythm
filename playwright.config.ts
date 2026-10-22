import { defineConfig } from '@playwright/test';

// Uses the locally installed Chrome (no browser download). Audio runs for real: the game's
// beat clock is the AudioContext, so these tests exercise the actual timing path.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 15 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    viewport: { width: 1152, height: 648 },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
