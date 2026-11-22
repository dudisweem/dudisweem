import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node", // UI tests opt into jsdom with a `@vitest-environment jsdom` docblock
    env: { TZ: "UTC" },
  },
});
