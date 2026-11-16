import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ["frontend", "localhost"],
    proxy: {
      ...(process.env.LCA_API_PROXY
        ? { "/api/": { target: process.env.LCA_API_PROXY } }
        : {}),
      ...Object.fromEntries(
        process.env.LCA_AUTH_PROXY
          ? [
              "/identitytoolkit.googleapis.com/",
              "/securetoken.googleapis.com/",
              "/emulator/",
            ].map((path) => [path, { target: process.env.LCA_AUTH_PROXY }])
          : [],
      ),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    // Half the cores per suite, so the two suites this host allows at once
    // (#76) do not oversubscribe it. On 8 cores two concurrent full runs
    // failed 4 + 3 tests (default workers, 104–106 s each) and passed with
    // this setting (76 s each); a single run stays within 125 % of the #76
    // baseline. Evidence: docs/engineering/unit-headroom-verification.md.
    maxWorkers: "50%",
  },
});
