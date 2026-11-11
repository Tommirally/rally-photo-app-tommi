import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests need the local Postgres and R2 emulator:
//   npm run test:integration   (starts both, then runs these)
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/db/**/*.test.ts", "tests/storage/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
