/**
 * Environment validation for the database connection.
 *
 * ## Why the URL is validated rather than asserted
 *
 * `client.ts` used to read `process.env["DATABASE_URL"]!` directly. The non-null assertion
 * silences the compiler while moving the failure somewhere worse: a missing variable becomes an
 * opaque driver error at the first query, or worse, a connection attempt to whatever `undefined`
 * stringifies to. Validating the value once, at the boundary where it enters the process, turns
 * that into a named error naming the missing key.
 *
 * Only the shape is checked, not the reachability of the server. Whether the database is up is a
 * deployment question, and failing on it during a build would make builds depend on a live server.
 * Connecting remains the caller's problem, and the first real query is where that surfaces.
 *
 * The value itself is never logged or included in an error: a connection string carries a password
 * (`RULES.md` section 33).
 */
import { z } from "zod";

/**
 * A PostgreSQL connection string.
 *
 * The scheme is required to be one of the PostgreSQL drivers rather than any URL, so a `file:` or
 * `https:` value fails here instead of reaching the driver.
 */
const databaseUrl = z
  // Zod 4 takes a single `error` for the type failure. Without it, an absent variable reports
  // "Invalid input: expected string, received undefined", which describes Zod's expectation rather
  // than telling an operator which variable is missing.
  .string({ error: "DATABASE_URL is required." })
  .min(1, "DATABASE_URL is required.")
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL must be a PostgreSQL connection string starting with postgres:// or postgresql://",
  );

/**
 * The environment shape this module needs.
 *
 * Deliberately not `NodeJS.ProcessEnv`: Next.js augments that type to make `NODE_ENV` required,
 * which would force every caller — including a test passing a one-key literal — to satisfy an
 * unrelated framework requirement. This module reads one variable and does not care what else is
 * present.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Read and validate the database URL from an environment record.
 *
 * @param env - The environment to read, injectable so this is testable without mutating
 *   `process.env`.
 * @throws {ConfigurationError} When the variable is absent or not a PostgreSQL URL.
 */
export function readDatabaseUrl(env: EnvSource = process.env): string {
  const parsed = databaseUrl.safeParse(env["DATABASE_URL"]);

  if (!parsed.success) {
    // Build the message from the schema rather than restating it, so the two cannot drift.
    const reason = parsed.error.issues.map((issue) => issue.message).join(" ");
    throw new ConfigurationError(reason, { details: { variable: "DATABASE_URL" } });
  }

  return parsed.data;
}

/** An environment or wiring fault that is a deployment problem, not a bad request. */
export class ConfigurationError extends Error {
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, options: { details?: Readonly<Record<string, unknown>> } = {}) {
    super(message);
    this.name = "ConfigurationError";
    this.details = options.details ?? {};
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
