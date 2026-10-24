import "server-only";
import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function projectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function usingEmulators(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

function createApp(): App {
  const options = {
    projectId: projectId(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  };
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (serviceAccount) {
    const json = JSON.parse(Buffer.from(serviceAccount, "base64").toString("utf8"));
    return initializeApp({ ...options, credential: cert(json) });
  }
  if (usingEmulators()) {
    return initializeApp(options);
  }
  // On Firebase App Hosting, FIREBASE_CONFIG and Application Default Credentials are provided.
  if (process.env.FIREBASE_CONFIG && !options.projectId) {
    return initializeApp();
  }
  return initializeApp({ ...options, credential: applicationDefault() });
}

type AdminGlobals = { app?: App; db?: Firestore };
const globalForAdmin = globalThis as unknown as { __sahooAdmin?: AdminGlobals };
const cache: AdminGlobals = (globalForAdmin.__sahooAdmin ??= {});

export function adminApp(): App {
  if (!cache.app) {
    cache.app = getApps()[0] ?? createApp();
  }
  return cache.app;
}

export function db(): Firestore {
  if (!cache.db) {
    // FIRESTORE_DATABASE_ID lets the app run against a database restored from backup.
    const databaseId = process.env.FIRESTORE_DATABASE_ID;
    const firestore = databaseId ? getFirestore(adminApp(), databaseId) : getFirestore(adminApp());
    firestore.settings({
      ignoreUndefinedProperties: true,
      // Without explicit credentials the emulator client still probes the GCE metadata server,
      // which stalls the first query by seconds and logs a MetadataLookupWarning off Google Cloud.
      ...(process.env.FIRESTORE_EMULATOR_HOST && {
        credentials: { client_email: "emulator@localhost", private_key: "emulator" },
      }),
    });
    cache.db = firestore;
  }
  return cache.db;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function storageBucket() {
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ?? (projectId() ? `${projectId()}.appspot.com` : undefined);
  return getStorage(adminApp()).bucket(bucketName);
}
