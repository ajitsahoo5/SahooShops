import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth";
import { adminAuth } from "@/server/firebaseAdmin";
import { assertSameOrigin, errorResponse } from "@/server/http";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const cookie = req.cookies.get(SESSION_COOKIE)?.value;
    if (cookie) {
      try {
        const decoded = await adminAuth().verifySessionCookie(cookie);
        await adminAuth().revokeRefreshTokens(decoded.sub);
      } catch {
        // An invalid or expired cookie is simply cleared.
      }
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}
