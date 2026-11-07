import { defineConfig } from "@playwright/test";

// Behavior smoke test against a running build:
//   npm run build && npm start
//   BASE_URL=http://localhost:3000 npm run test:smoke   (in another shell)
export default defineConfig({
  testDir: "tests",
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    // The installed Google Chrome, so no Playwright browser download is needed.
    channel: "chrome",
  },
});
