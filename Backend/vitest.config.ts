import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@config": fileURLToPath(new URL("./src/config", import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@domain": fileURLToPath(new URL("./src/domain", import.meta.url)),
      "@modules": fileURLToPath(new URL("./src/modules", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@contexts": fileURLToPath(new URL("./src/contexts", import.meta.url)),
      "@data": fileURLToPath(new URL("./src/data", import.meta.url)),
      "@application": fileURLToPath(new URL("./src/application", import.meta.url)),
      "@presentation": fileURLToPath(new URL("./src/presentation", import.meta.url)),
      "@bootstrap": fileURLToPath(new URL("./src/bootstrap", import.meta.url)),
      "@background": fileURLToPath(new URL("./src/background", import.meta.url)),
      "@infrastructure": fileURLToPath(new URL("./src/infrastructure", import.meta.url)),
      "@interfaces": fileURLToPath(new URL("./src/interfaces", import.meta.url)),
    },
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "src/**/*.test.ts", "src/main.ts", "src/bootstrap/*"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});