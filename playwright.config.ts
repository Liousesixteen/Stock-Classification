import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

const localChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (existsSync(localChromePath) ? localChromePath : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command:
      "rm -f data/e2e-stock-classification.sqlite data/e2e-stock-classification.sqlite-shm data/e2e-stock-classification.sqlite-wal && STOCK_CLASSIFICATION_DB_PATH=data/e2e-stock-classification.sqlite npm run dev -- --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 120000,
  },
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
      },
    },
  ],
});
