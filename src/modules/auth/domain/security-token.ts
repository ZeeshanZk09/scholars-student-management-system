/**
 * Single-use security tokens — generation and hashing for `security_events`
 * (`src/db/schema/identity.ts`) and the session `sid`.
 *
 * `SECURITY.md` §8: reset/verification tokens must be cryptographically random, expiring,
 * single-use, and never logged. The single-use and expiry parts are enforced against the
 * database row; what belongs here is the pure part: minting 256 bits of randomness and reducing
 * a token to the SHA-256 digest that the table stores.
 *
 * Why hash a token that is only ever delivered out-of-band anyway: the `security_events` and
 * `sessions` tables are exactly what an attacker with read access wants, and a leaked backup
 * must not hand over live tokens (`identity.ts`, `sessions` doc comment).
 */
import { createHash, randomBytes } from "node:crypto";

/** Bytes of entropy per token. 32 bytes = 256 bits, comfortably above any guessing concern. */
export const TOKEN_BYTES = 32;

/**
 * Mint a new token: 32 random bytes, base64url-encoded (URL-safe, no padding).
 *
 * The string exists only in the caller's hands and the message it will be put in. It must
 * never be logged (`SECURITY.md` §8, `RULES.md` §52).
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * The value stored in `token_hash` / `sessions.token_hash`: lowercase hex SHA-256 of the
 * token. Lookups are by this digest, so the plaintext is never persisted or compared.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
