/**
 * Environment validation for the authentication configuration.
 *
 * Mirrors `src/db/env.ts`: the value is validated once at the boundary where it enters the
 * process, so a missing or blank secret fails with a named error at module load rather than as
 * an opaque "no secret" failure at the first sign-in attempt.
 *
 * `AUTH_SECRET` signs the session cookie (`RULES.md` §23's integrity half: the cookie is
 * httpOnly and server-validated for revocation, but its bytes must also be tamper-evident). A
 * blank or placeholder value would silently sign with garbage, so length is part of the contract.
 *
 * The value itself is never logged or included in an error message.
 */
import { z } from "zod";

import { ConfigurationError } from "@/db/env";

/** Minimum length before the secret is considered a real secret rather than a placeholder. */
export const AUTH_SECRET_MIN_LENGTH = 32;

const authSecret = z
  .string({ error: "AUTH_SECRET is required." })
  .min(
    AUTH_SECRET_MIN_LENGTH,
    `AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters — generate one with ` +
      "`openssl rand -base64 32`.",
  )
  .refine(
    (value) => value !== "replace-with-a-random-secret",
    "AUTH_SECRET is still the placeholder from .env.example — generate one with `openssl rand -base64 32`.",
  );

/**
 * The origin used to build links inside verification/reset emails (`/verify-email?...`).
 * Defaults to the dev server so a fresh clone works without configuration.
 */
const appBaseUrl = z
  .url({ error: "APP_BASE_URL must be a URL." })
  .or(z.literal("http://localhost:3000", { error: "APP_BASE_URL must be a URL." }));

/** A subset of `process.env` — injectable for tests, same rationale as `db/env.ts`. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Read and validate `AUTH_SECRET`.
 *
 * @throws {ConfigurationError} When absent, too short, or still the example placeholder.
 */
export function readAuthSecret(env: EnvSource = process.env): string {
  const parsed = authSecret.safeParse(env["AUTH_SECRET"]);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new ConfigurationError(reason, { details: { variable: "AUTH_SECRET" } });
  }
  return parsed.data;
}

/**
 * Read `APP_BASE_URL`, defaulting to the local dev origin.
 *
 * @throws {ConfigurationError} When present but not a URL.
 */
export function readAppBaseUrl(env: EnvSource = process.env): string {
  const raw = env["APP_BASE_URL"];
  if (raw === undefined || raw === "") {
    return "http://localhost:3000";
  }
  const parsed = appBaseUrl.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new ConfigurationError(reason, { details: { variable: "APP_BASE_URL" } });
  }
  return raw.replace(/\/+$/, "");
}
