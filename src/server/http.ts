import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { DomainError, isDomainError } from "@/lib/errors";
import { requireAdmin, type Actor } from "./auth";

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const path = first?.path.join(".");
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: first ? `${path ? `${path}: ` : ""}${first.message}` : "Invalid request",
          details: z.flattenError(error),
        },
      },
      { status: 400 },
    );
  }
  if (isDomainError(error)) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  console.error("Unhandled API error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

/** Rejects state-changing browser requests that come from another site (CSRF defence). */
export function assertSameOrigin(req: NextRequest): void {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new DomainError("FORBIDDEN", "Cross-site request blocked.");
  }
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new DomainError("FORBIDDEN", "Invalid request origin.");
    }
    if (host && originHost !== host) {
      throw new DomainError("FORBIDDEN", "Cross-origin request blocked.");
    }
  }
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new DomainError("VALIDATION", "Request body must be valid JSON.");
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  return schema.parse(params);
}

type RouteArgs<P> = { req: NextRequest; actor: Actor; params: P };

/**
 * Wraps a Route Handler with admin authorization, CSRF protection, and uniform error responses.
 * Handlers return a Response or a JSON-serializable value.
 */
export function adminRoute<P = Record<string, string>>(
  handler: (args: RouteArgs<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const actor = await requireAdmin();
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await handler({ req, actor, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
