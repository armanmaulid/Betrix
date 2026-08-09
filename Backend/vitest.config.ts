import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src-new/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "src-new/**/*.test.ts", "src-new/main.ts", "src-new/bootstrap/*"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});