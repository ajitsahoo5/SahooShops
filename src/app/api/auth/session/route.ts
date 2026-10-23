import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { SESSION_COOKIE, sessionMaxAgeMs } from "@/server/auth";
import { adminAuth } from "@/server/firebaseAdmin";
import { assertSameOrigin, errorResponse, parseBody } from "@/server/http";

const bodySchema = z.object({ idToken: z.string().min(10).max(5000) });

const RECENT_SIGN_IN_SECONDS = 5 * 60;

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { idToken } = await parseBody(req, bodySchema);
    const decoded = await adminAuth()
      .verifyIdToken(idToken, true)
      .catch(() => {
        throw new DomainError("UNAUTHORIZED", "Sign-in failed. Please try again.");
      });
    if (decoded.admin !== true) {
      throw new DomainError("FORBIDDEN", "This account is not allowed to use Sahoo Shop.");
    }
    if (Date.now() / 1000 - decoded.auth_time > RECENT_SIGN_IN_SECONDS) {
      throw new DomainError("UNAUTHORIZED", "Sign-in expired. Please sign in again.");
    }
    const expiresIn = sessionMaxAgeMs();
    const sessionCookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(expiresIn / 1000),
    });
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}
