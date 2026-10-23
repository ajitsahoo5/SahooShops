"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";

let auth: Auth | null = null;

function app(): FirebaseApp {
  return (
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  );
}

/** Browser Auth client. Sessions live in an httpOnly cookie, so nothing is persisted here. */
export async function clientAuth(): Promise<Auth> {
  if (!auth) {
    auth = getAuth(app());
    if (process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === "true") {
      connectAuthEmulator(auth, process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
    }
    await setPersistence(auth, inMemoryPersistence);
  }
  return auth;
}
