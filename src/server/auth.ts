import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { DomainError } from "@/lib/errors";
import { adminAuth } from "./firebaseAdmin";

/** Firebase-hosted backends only forward a cookie named `__session`. */
export const SESSION_COOKIE = "__session";

export type Actor = {
  uid: string;
  email: string;
};

export function sessionMaxAgeMs(): number {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS ?? 5);
  const clamped = Math.min(Math.max(Number.isFinite(days) ? days : 5, 1), 14);
  return clamped * 24 * 60 * 60 * 1000;
}

export async function verifySession(cookieValue: string | undefined): Promise<Actor | null> {
  if (!cookieValue) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookieValue, true);
    if (decoded.admin !== true) return null;
    return { uid: decoded.uid, email: decoded.email ?? "" };
  } catch {
    return null;
  }
}

/** Returns the signed-in administrator for this request, or null. Memoized per request. */
export const getSessionActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
});

/** For Route Handlers: throws a 401 DomainError when the caller is not the administrator. */
export async function requireAdmin(): Promise<Actor> {
  const actor = await getSessionActor();
  if (!actor) {
    throw new DomainError("UNAUTHORIZED", "Please sign in again.");
  }
  return actor;
}

/** For Server Components: redirects to the login page when the caller is not signed in. */
export async function requireAdminPage(): Promise<Actor> {
  const actor = await getSessionActor();
  if (!actor) redirect("/login");
  return actor;
}
