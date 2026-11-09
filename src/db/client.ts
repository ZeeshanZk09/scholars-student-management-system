import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";

import { readDatabaseUrl } from "./env";
import * as schema from "./schema";

/**
 * The pooled PostgreSQL client, plus the derived transaction type.
 *
 * ## Why the client is cached on `globalThis`
 *
 * Passing a connection string to `drizzle()` makes it construct a `pg.Pool` internally. Under
 * Next.js dev the module graph is re-evaluated on hot reload, so an uncached client would open a
 * fresh pool on every edit until PostgreSQL refused connections. Caching on `globalThis` — which
 * survives module re-evaluation within one process — keeps dev stable without affecting production,
 * where the module is evaluated once and the cache is simply the first assignment.
 */

const globalForDb = globalThis as typeof globalThis & {
  scholarsDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export const db =
  globalForDb.scholarsDb ?? (globalForDb.scholarsDb = drizzle(readDatabaseUrl(), { schema }));

if (process.env["NODE_ENV"] !== "production") {
  // Surfaces accidental second instantiation during dev instead of leaking pools silently.
  if (globalForDb.scholarsDb !== db) {
    throw new Error("Two database clients were created. Import `db` from `src/db/client.ts`.");
  }
}

/**
 * The scope handed to a `db.transaction` callback.
 *
 * Derived from `db` itself rather than imported by name. `PgTransaction` is exported by
 * `drizzle-orm/pg-core`, but naming it directly means also naming the driver's query-result HKT
 * (`NodePgQueryResultHKT`) to satisfy its first type parameter, which couples this module to a
 * driver internal. Deriving it keeps the public surface at one import and makes it impossible for
 * the type to drift from the runtime.
 *
 * Use cases should type their work against this rather than the raw client, so a repository can be
 * handed a transaction without caring which it is.
 */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything a repository accepts: the pooled client, or the scope handed to `db.transaction`.
 *
 * This is the cross-module transaction seam: a store re-created over a `DbLike` runs *inside* the
 * caller's transaction (its own nested `transaction` becomes a savepoint), which is what lets
 * `src/modules/admission` convert an application — student, guardian, placement, enrollment and
 * the admission row itself — as one atomic write without either module reaching into the other's
 * internals.
 *
 * A union rather than `typeof db` alone: `PgTransaction` shares the full query surface
 * (`PgDatabase`) but not the `$client` property the pooled instance carries, so neither member
 * alone covers both scopes.
 */
export type DbLike = typeof db | DbTransaction;
