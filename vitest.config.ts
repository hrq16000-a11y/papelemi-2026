import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/test/**/*.{test,spec}.{ts,tsx}"], // Source Emporio tests retain their original-domain fixtures and run in the source project, not PapeLemi.
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
