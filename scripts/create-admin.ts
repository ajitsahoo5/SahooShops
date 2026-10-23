/**
 * Creates (or updates) the single Sahoo Shop administrator and grants the `admin` claim.
 *
 * Usage:
 *   npm run create-admin -- owner@example.com "a-strong-password"
 *
 * Uses the Auth emulator when FIREBASE_AUTH_EMULATOR_HOST is set; otherwise it needs
 * Application Default Credentials or FIREBASE_SERVICE_ACCOUNT_BASE64.
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> "<password>"');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Use a password of at least 10 characters.");
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (serviceAccount) {
    initializeApp({ projectId, credential: cert(JSON.parse(Buffer.from(serviceAccount, "base64").toString("utf8"))) });
  } else if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    initializeApp({ projectId });
  } else {
    initializeApp({ projectId, credential: applicationDefault() });
  }

  const auth = getAuth();
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, emailVerified: true, disabled: false });
    uid = existing.uid;
    console.log(`Updated existing user ${email}`);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    const created = await auth.createUser({ email, password, emailVerified: true });
    uid = created.uid;
    console.log(`Created user ${email}`);
  }

  await auth.setCustomUserClaims(uid, { admin: true });
  await auth.revokeRefreshTokens(uid);
  console.log(`Granted admin access to ${email} (uid ${uid}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
