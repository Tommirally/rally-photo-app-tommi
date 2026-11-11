import { defineConfig, devices } from "@playwright/test";

// Browser tests against the production build: `npm run build && npm run test:e2e`.
// They use the demo event, so no Supabase or R2 settings are needed.
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3123", trace: "off" },
  projects: [
    { name: "iPhone 13", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "Pixel 7", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx next start -p 3123",
    url: "http://localhost:3123",
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
  },
});
