import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/support/integration-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      // A separate project keeps test data isolated from the local dev data in the same emulators.
      FIREBASE_PROJECT_ID: "demo-sahoo-test",
      GCLOUD_PROJECT: "demo-sahoo-test",
      FIREBASE_STORAGE_BUCKET: "demo-sahoo-test.appspot.com",
      // Defaults match firebase.test.json; `npm run test:integration` sets these automatically.
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8180",
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9299",
      FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9399",
    },
  },
});
