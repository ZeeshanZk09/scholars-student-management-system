/**
 * Argon2id password hashing — the `user_credentials` half of Phase 3 tasks 2–3.
 *
 * `SECURITY.md` §6 names Argon2id first. The encoded hash is self-describing
 * (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), so verification needs only the stored string;
 * the `algorithm` and `parameters` columns exist so the cost can be re-tuned and audited as data
 * (`identity.ts`, `user_credentials` doc comment) rather than as a constant buried here.
 *
 * Nothing in this file logs, returns or throws the plaintext. The only value that leaves is a
 * boolean or an encoded hash.
 */
import { hash, verify } from "@node-rs/argon2";

import type { StoredPassword } from "../domain/credential";

/**
 * Argon2id cost parameters (v19 / RFC 9106 recommendation territory: 64 MiB, t=3, p=4,
 * 32-byte salt, 32-byte tag). 64 MiB is the OWASP minimum for Argon2id.
 *
 * Held as data so `hashPassword` can return exactly what was used, row by row.
 */
export const ARGON2ID_PARAMETERS = {
  memoryCost: 65_536, // KiB = 64 MiB
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

/**
 * Hash a plaintext password for storage.
 *
 * @param plaintext - The password as provided. Never logged, never stored.
 */
export async function hashPassword(plaintext: string): Promise<StoredPassword> {
  // `algorithm` is omitted deliberately: `@node-rs/argon2` defaults to Argon2id (its type is an
  // ambient const enum, unusable under isolatedModules), and the assertion below fails loudly
  // if a future version ever changes that default.
  const passwordHash = await hash(plaintext, {
    memoryCost: ARGON2ID_PARAMETERS.memoryCost,
    timeCost: ARGON2ID_PARAMETERS.timeCost,
    parallelism: ARGON2ID_PARAMETERS.parallelism,
    outputLen: ARGON2ID_PARAMETERS.outputLen,
  });

  if (!passwordHash.startsWith("$argon2id$")) {
    // A non-Argon2id hash here would silently store a weaker algorithm under `algorithm:
    // "argon2id"` in the row. Refuse to produce the row at all.
    throw new Error("argon2 library produced a non-Argon2id hash; refusing to store it.");
  }

  return {
    passwordHash,
    algorithm: "argon2id",
    parameters: { ...ARGON2ID_PARAMETERS },
  };
}

/**
 * Verify a plaintext password against a stored credential.
 *
 * Returns `false` for any mismatch or unverifiable hash. It deliberately does not distinguish
 * "wrong password" from "corrupt hash": both are authentication failures and the caller
 * (which already knows the account exists) has no legitimate use for the difference.
 *
 * A credential row with no hash (an invited user) is simply never a match.
 */
export async function verifyPassword(
  plaintext: string,
  stored: Pick<StoredPassword, "passwordHash"> | null | undefined,
): Promise<boolean> {
  if (!stored || stored.passwordHash === "") return false;
  try {
    return await verify(stored.passwordHash, plaintext);
  } catch {
    return false;
  }
}
