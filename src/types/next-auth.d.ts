/**
 * Auth.js type augmentation (v5).
 *
 * Two additions, both load-bearing:
 *
 * - `User.sid` — the plaintext session identifier `authorize()` mints. It travels once, from
 *   `authorize` into the `jwt` callback's `user` parameter, and from there into the token.
 *   It is never part of `Session` (what pages see): page code gets `session.user.id` and has
 *   no business knowing the revocation handle.
 * - `JWT.sid` — the same identifier on the token, read by the `jwt` callback on every
 *   subsequent request to validate against the `sessions` row.
 *
 * `session.user.id` (below) is what every server-side authorization check keys on; `sub`
 * carries the same value and the `jwt` callback keeps the two in step.
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** The `users.id` this session authenticates — the key for every AuthZ lookup. */
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    /** Plaintext session id from `authorize`; consumed by the `jwt` callback, never exposed. */
    sid: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Plaintext session id; the `sessions` row stores only its SHA-256. */
    sid?: string;
  }
}
