import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // `server-only` throws outside React Server Components; tests import server modules directly.
      "server-only": path("./src/test/server-only.ts"),
    },
  },
  test: {
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/__tests__/**", "src/test/**"],
      reporter: ["text", "text-summary", "json-summary"],
      // Every line, statement, function and branch in src/ is exercised. Keep it that way:
      // new code needs tests, and genuinely unreachable code should be removed rather than ignored.
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
  },
});
