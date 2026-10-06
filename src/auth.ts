/**
 * Auth.js (NextAuth v5) configuration — the framework glue for Phase 3 tasks 5–8
 * (`ADR-0005` records the decision; `src/modules/auth/index.ts` owns everything below this).
 *
 * ## The shape of a session here
 *
 * Credentials + JWT strategy (a hard requirement: `Credentials` with `database` throws
 * `UnsupportedStrategy`), but *not* a stateless one. The cookie is an encrypted JWT whose
 * payload carries `sid`; the `sessions` table row behind `sid` is authoritative and is checked
 * in the `jwt` callback on **every** session read. Returning `null` there is the revocation
 * switch — logout, password reset, admin revoke and suspension all take effect on the next
 * request (`RULES.md` §23; `SECURITY.md` §10).
 *
 * ## Failure codes, not failure prose
 *
 * `authorize` translates the application's `SignInResult` into `CredentialsSignin` subclasses
 * whose `code` reaches the client as `signIn(...).code` (never as prose, never as a stack).
 * `SECURITY.md` §62 constrains what those codes may say: nothing an unauthenticated caller
 * could not already infer, and account-specific detail only after a correct password.
 */
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import {
  authSecret,
  authenticate,
  revokeSession,
  validateSession,
  SESSION_MAX_AGE_SECONDS,
} from "@/modules/auth";

/**
 * A sign-in failure carrying the application's reason as the URL-safe `code`.
 *
 * The base class's warning applies: the code lands in a query string, so it must never hint at
 * anything an unauthenticated prober could not already infer. The reasons here satisfy that —
 * `invalid_credentials` is deliberately identical for unknown email and wrong password, and
 * the account-specific codes are only reachable after a correct password.
 */
class SignInFailed extends CredentialsSignin {
  constructor(reason: string) {
    super();
    this.code = reason;
  }
}

/** Boundary validation for the credentials payload (`ARCHITECTURE.md` §29). */
const credentialsSchema = z.object({
  email: z.string().max(320),
  password: z.string().max(128),
});

/** Extract the client origin facts the store records on the session row. */
function originFrom(request: Request): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
  return { ipAddress, userAgent: request.headers.get("user-agent") };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The secret is validated at import: a blank or placeholder `AUTH_SECRET` is a deployment
  // fault, and failing here names it instead of failing later as a decode error.
  secret: authSecret(),

  // Self-hosted (Docker → reverse proxy): Auth.js must trust the forwarded host header.
  trustHost: true,

  session: {
    strategy: "jwt",
    // The cookie's whole life — the DB row's absolute cap (`domain/session-policy.ts`) is the
    // same number, so the two cannot drift apart silently.
    maxAge: SESSION_MAX_AGE_SECONDS,
  },

  pages: {
    signIn: "/login",
  },

  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env["NODE_ENV"] === "production",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      },
    },
  },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new SignInFailed("invalid_credentials");
        }

        const result = await authenticate({
          email: parsed.data.email,
          password: parsed.data.password,
          now: new Date(),
          origin: originFrom(request),
        });

        if (!result.ok) {
          throw new SignInFailed(result.reason);
        }

        // `sid` rides to the `jwt` callback exactly once, via `user`.
        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          sid: result.session.sid,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * Runs on the initial sign-in *and* on every subsequent session read — which is what makes
     * this the revocation gate. The DB check is authoritative; the JWT is only the carrier.
     */
    async jwt({ token, user }) {
      if (user) {
        // Fresh sign-in: adopt the sid `authorize` minted. (OAuth users have no `sid`; this
        // deployment has no OAuth provider, and adding one would revisit ADR-0005.)
        return { ...token, sid: user.sid };
      }

      if (typeof token.sid !== "string") {
        // A token without a session handle cannot be backed by a session row.
        return null;
      }

      const live = await validateSession({ sid: token.sid, now: new Date() });
      if (live === null) {
        // Expired, revoked, or the account is no longer active — end the session.
        return null;
      }

      return token;
    },

    async session({ session, token }) {
      if (token.sid === undefined) {
        // `jwt` returned a token only when it was backed by a live row; this is belt-and-braces.
        return { ...session, user: { ...session.user, id: "" } };
      }
      const userId = typeof token.sub === "string" ? token.sub : "";
      return {
        ...session,
        user: { ...session.user, id: userId },
      };
    },

    /**
     * Open-redirect defence: relative paths and same-origin absolute URLs only. The default
     * would also serve subdomains this deployment does not have.
     */
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url;
      } catch {
        // Malformed URL — fall through to the base.
      }
      return baseUrl;
    },
  },

  events: {
    /**
     * Sign-out is two things: cookie gone (Auth.js) and row revoked (here). The row outlives
     * the cookie on purpose — `sessions.revokedAt` keeps the device-visible audit record
     * (`identity.ts`), and a stolen cookie copy dies with the same revoke.
     */
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token && typeof token.sid === "string") {
        await revokeSession({ sid: token.sid, now: new Date() });
      }
    },
  },
});
