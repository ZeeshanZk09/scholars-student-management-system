/**
 * Request proxy (Next 16's `middleware` replacement) — Phase 3 task 14, the optimistic half
 * of the access gate.
 *
 * ## What it is allowed to do
 *
 * Cookie *presence* only. The proxy runs early in the request pipeline and must stay cheap
 * and side-effect free: no DB, no JWT decode (the cookie is encrypted; decoding would need
 * the secret in a context designed to be thin), no per-request session policy. A stolen or
 * revoked cookie sails through here — that is fine, because two authoritative checks sit
 * downstream: the `jwt` callback validates the `sid` row on every `auth()` call, and
 * `(app)/layout.tsx` redirects on a null session. This file exists only so that obvious
 * unauthenticated requests to protected pages never *render* — they bounce to `/login` with a
 * `callbackUrl`, which the login form honours after a successful sign-in.
 *
 * The same origin rule as the `redirect` callback in `src/auth.ts`: only same-site paths are
 * ever echoed back, so `?callbackUrl=//evil.example` redirects nowhere but `/login`.
 */
import { NextResponse, type NextRequest } from "next/server";

/** Paths any caller may reach without a session cookie. */
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/api/auth",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function safeCallbackUrl(pathname: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.startsWith("/\\")) {
    return "/";
  }
  return pathname;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Both names: Auth.js uses the `__Secure-` prefix only under HTTPS (`@auth/core` cookie.js).
  const hasSessionCookie =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const callbackUrl = safeCallbackUrl(pathname);
  if (callbackUrl !== "/") {
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Static assets and image optimisation never need the gate; everything else does —
  // including API routes other than `/api/auth`, which the in-function public check exempts.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
