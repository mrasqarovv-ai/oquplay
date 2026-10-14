import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 90000,
 use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure',
  launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'] } : {},
 }, reporter: 'list',
});
