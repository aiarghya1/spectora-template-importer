import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

/**
 * End-to-end tests against a real Supabase-backed app.
 * Local:    E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e        (starts `npm run dev` with .env.local)
 * Deployed: E2E_BASE_URL=https://… E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
 */
loadEnvConfig(process.cwd());
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const missingCredentials = ["E2E_EMAIL", "E2E_PASSWORD"].filter((name) => !process.env[name]);
if (missingCredentials.length > 0) {
  throw new Error(`E2E tests require ${missingCredentials.join(" and ")}. Configure a test account before running them.`);
}

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
