import { defineConfig, devices } from '@playwright/test';

const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', locale: 'he-IL', timezoneId: 'Asia/Jerusalem', launchOptions },
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: true },
  projects: [
    { name: 'phone-360', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, defaultBrowserType: 'chromium' } },
    { name: 'phone-390', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, defaultBrowserType: 'chromium' } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  ],
});
