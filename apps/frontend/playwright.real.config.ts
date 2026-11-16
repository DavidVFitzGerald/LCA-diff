import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-real",
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "line",
  outputDir: "/tmp/lca-real-test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.LCA_E2E_BASE_URL ?? "http://frontend:4173",
    headless: true,
    screenshot: "only-on-failure",
  },
});
