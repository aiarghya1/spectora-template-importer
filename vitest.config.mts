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
      // Set just below measured coverage so it can only go up. Critical paths are held higher.
      thresholds: {
        lines: 97,
        statements: 95,
        functions: 94,
        branches: 87,
        "src/lib/import/**": { lines: 96, functions: 100 },
        "src/lib/html/**": { lines: 96, functions: 100 },
        "src/app/templates/actions.ts": { lines: 100, functions: 100 },
        "src/app/api/**": { lines: 100, functions: 100 },
      },
    },
  },
});
