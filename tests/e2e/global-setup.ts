import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const E2E_ADMIN = { email: "e2e-admin@sahoo.test", password: "E2E-admin-password-1" };

export default async function globalSetup() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-sahoo" });
  const auth = getAuth(app);
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(E2E_ADMIN.email)).uid;
    await auth.updateUser(uid, { password: E2E_ADMIN.password });
  } catch {
    uid = (await auth.createUser({ email: E2E_ADMIN.email, password: E2E_ADMIN.password, emailVerified: true })).uid;
  }
  await auth.setCustomUserClaims(uid, { admin: true });
}
