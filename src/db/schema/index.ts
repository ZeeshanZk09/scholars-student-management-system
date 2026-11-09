/**
 * Schema barrel — the single entry point for `drizzle.config.ts` and `src/db/client.ts`.
 *
 * This module is the one place both read from, so a table only exists for the ORM if it is re-exported
 * here. That is deliberate: a table declared in its own file but forgotten here would be invisible to
 * migrations and to the relational query builder, which is precisely the class of bug that stays
 * invisible until production.
 *
 * ## `schema` is built by re-export, not by a hand-written list
 *
 * An earlier version of this file exported `export const schema = {} as const`. A hand-maintained table
 * map is a list that drifts: the day somebody adds a `pgTable` and forgets the entry, the table exists in
 * a file, passes `tsc`, passes lint, and produces no migration. So `schema` is assembled by re-exporting
 * every module's namespace, which makes a missing export a compile error instead of a silent omission.
 *
 * `relations.ts` is spread into the same object because Drizzle requires relations to be registered on
 * the same schema object used for queries.
 */

/* Shared enum types — must be exported here or drizzle-kit emits columns that
 * reference `"user_status"`-style types without ever generating their `CREATE TYPE`,
 * producing a migration that fails on first apply (see §13 of MEMORY.md). */
export * from "./_enums";

/* Identity and authorization. */
export * from "./identity";
export * from "./authorization";

/* Institution, campus, and academic structure. */
export * from "./institution";
export * from "./academic";

/* People and their lifecycle records. */
export * from "./student";
export * from "./guardian";
export * from "./admission";
export * from "./hr";
export * from "./teacher";

/* Attendance and the biometric boundary. */
export * from "./attendance";
export * from "./biometric";
export * from "./floor-operations";

/* Assessment. */
export * from "./examinations";
export * from "./daily-tests";
export * from "./diary";

/* Money. */
export * from "./fees";
export * from "./finance";
export * from "./payroll";

/* Workflows and communication. */
export * from "./complaints";
export * from "./communication";

/* Cross-cutting governance and infrastructure. */
export * from "./governance";
export * from "./jobs";

/**
 * Drizzle relational definitions.
 *
 * Imported as a namespace and spread, so `db.query.*` can resolve `with` clauses. Kept in its own file
 * because these definitions reference every module and would otherwise create an import cycle back into
 * the table modules.
 */
export * from "./relations";

/**
 * The table map Drizzle reads for queries, and drizzle-kit reads for migrations.
 *
 * Assembled from the module namespaces rather than enumerated, so a new table is registered by exporting
 * it from its own file. `typeof import(...)` would need the same list; a namespace spread is the only form
 * that cannot be forgotten.
 */
import * as academic from "./academic";
import * as admission from "./admission";
import * as attendance from "./attendance";
import * as authorization from "./authorization";
import * as biometric from "./biometric";
import * as communication from "./communication";
import * as complaints from "./complaints";
import * as dailyTests from "./daily-tests";
import * as diary from "./diary";
import * as examinations from "./examinations";
import * as fees from "./fees";
import * as finance from "./finance";
import * as floorOperations from "./floor-operations";
import * as governance from "./governance";
import * as guardian from "./guardian";
import * as hr from "./hr";
import * as identity from "./identity";
import * as institution from "./institution";
import * as jobs from "./jobs";
import * as payroll from "./payroll";
import * as relations from "./relations";
import * as student from "./student";
import * as teacher from "./teacher";

export const schema = {
  ...identity,
  ...authorization,
  ...institution,
  ...academic,
  ...student,
  ...guardian,
  ...admission,
  ...hr,
  ...teacher,
  ...attendance,
  ...biometric,
  ...floorOperations,
  ...examinations,
  ...dailyTests,
  ...diary,
  ...fees,
  ...finance,
  ...payroll,
  ...complaints,
  ...communication,
  ...governance,
  ...jobs,
  ...relations,
} as const;
