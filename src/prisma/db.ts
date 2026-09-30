import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };
import { readDatabaseUrl } from "./env";

export const db = postgres<Contract>({
  contractJson,
  url: readDatabaseUrl(),
});

/**
 * The scope handed to a `db.transaction` callback.
 *
 * Derived from `db` itself rather than imported by name. Prisma 8 does not re-export
 * `PostgresTransactionContext` from `@prisma/orm-postgres/runtime`, so naming it would mean
 * depending on a transitive package — which is exactly the coupling the published interface is
 * meant to avoid. Deriving it also means the type cannot drift from the runtime.
 *
 * Use cases should type their work against this rather than the raw client, so a repository can be
 * handed a transaction without caring which it is.
 */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
