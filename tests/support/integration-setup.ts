import { beforeEach } from "vitest";

const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-sahoo-test";

export async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to clear Firestore emulator: ${res.status}`);
}

beforeEach(async () => {
  await clearFirestore();
});
