import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // App-style imports work in tests; `server-only` is a no-op outside Next.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      "@": path.resolve(__dirname),
    },
  },
  test: {
    // node by default; component tests opt into jsdom per-file via
    // `// @vitest-environment jsdom`.
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
