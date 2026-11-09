/**
 * Column conventions shared by every table in this schema.
 *
 * `PHASES.md` Phase 2 tasks 7–15 require the ID, timestamp, money, slug, archival, concurrency and
 * audit strategies to be *established* before domain tables are written, so that a new table cannot
 * quietly invent a fourth way of doing any of them. This module is that establishment. It exports
 * builder factories rather than column instances, because Drizzle columns belong to exactly one
 * table and reusing an instance across tables corrupts the schema.
 *
 * Nothing here may import a table — that would make every table file depend on every other one.
 */

import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  check,
  integer,
  numeric,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Primary key: a random UUID (`gen_random_uuid()`).
 *
 * `PHASES.md` Phase 2 task 7. Three reasons this is not an autoincrement integer:
 *
 * 1. `RULES.md` §24–25 requires readable, non-sequential public identifiers. A sequential integer
 *    leaks record volume and lets anyone enumerate `students` by counting.
 * 2. IDs are generated client-side by the application, so a row can be constructed and referenced
 *    before it is inserted — which is what makes multi-table transactional writes (fee + receipt +
 *    ledger, `RULES.md` §16) expressible without a second round trip.
 * 3. Nothing in this system is ever numbered for humans. Human-facing references are admission
 *    numbers and slugs, which are separate columns with their own uniqueness rules.
 */
export const primaryId = (name = "id") => uuid(name).primaryKey().defaultRandom();

/* -------------------------------------------------------------------------- */
/* Timestamps                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `created_at timestamptz` — the instant the row was first written.
 *
 * Timezone-aware (`withTimezone: true`) because the school operates in PKT while the host may be
 * UTC. A naive timestamp is a bug that only appears twice a year, at a timezone boundary.
 * `precision: 3` keeps millisecond resolution, which is what ordering, same-second audit ordering
 * and test equality actually need — microsecond precision would only add noise to diffs.
 */
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow();

/**
 * `updated_at timestamptz` — the instant of the last mutation.
 *
 * Deliberately **not** auto-updated by a trigger or by `$onUpdate`. Two reasons:
 *
 * - `updatedAt` participates in optimistic concurrency (`RULES.md` §17), so its value must be part
 *   of the `WHERE` clause of the update that changes it. A trigger would overwrite the value the
 *   caller's version check is supposed to be comparing against.
 * - Use cases must pass it explicitly, which makes "this write touches `updated_at`" a visible part
 *   of the update rather than invisible behaviour. `touchedColumns()` returns the increment.
 */
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow();

/**
 * The value an update must write to `updated_at`.
 *
 * `RULES.md` §17 requires stale writes to be detected rather than silently applied. Callers pair
 * this with a version predicate; see `versionedUpdate()`.
 */
export function touchedColumns() {
  return { updatedAt: new Date() };
}

/* -------------------------------------------------------------------------- */
/* Archival                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `archived_at timestamptz` — nullable, and the *only* soft-delete marker in this schema.
 *
 * `DOMAIN-MODEL.md` D-4 splits two axes that the archived schema collapsed into one `status`
 * column: lifecycle (admitted / active / graduated / withdrawn) and archival. A graduated student is
 * not archived; a transferred student is not graduated. Both live in `pgEnum` lifecycle columns;
 * archival lives here and here only.
 *
 * Non-null means archived. Queries filter with `archivedAt is null` rather than a boolean, so the
 * column cannot hold the third meaningless state.
 */
export const archivedAt = () => timestamp("archived_at", { withTimezone: true, precision: 3 });

/* -------------------------------------------------------------------------- */
/* Concurrency                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `version integer` — optimistic concurrency token, starting at 1.
 *
 * `RULES.md` §17: "If stale data is detected, do not silently overwrite newer data." Two users open
 * the same student record; the second save must lose. The update therefore carries
 * `where (and eq(t.id, id), eq(t.version, versionReadByTheBrowser))` and bumps `version` by one.
 * Zero rows updated means someone else wrote first, and the use case returns a conflict rather
 * than an overwrite. Last-writer-wins is not acceptable for fee, payroll, marks or attendance rows.
 *
 * `version` is not a timestamp because two writes inside the same second are ordinary, not rare.
 */
export const version = () => integer("version").notNull().default(1);

/**
 * `institution_id uuid` — the tenant key, nullable for platform-level rows only.
 *
 * `RULES.md` §15 makes the database the source of truth for integrity, and every institution-owned
 * record carries this column so a scope check is a column comparison rather than a join. Nullable
 * only where the row genuinely predates an institution: `users`, `roles`, `permissions` and the
 * authentication tables, which are platform-wide by design (ADR-0001).
 */
export const institutionScoped = (name = "institution_id") => uuid(name);

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `slug` — human-readable, stable, scoped URL segment.
 *
 * `RULES.md` §24 wants `/students/muhammad-zeeshan-khan`, never `/students/48392`. A slug is *not*
 * the primary key: it is a second, mutable-free identifier with its own uniqueness scope, because a
 * slug is derived from a display name that can change while the row must not.
 */
export const slug = (length = 120) => varchar("slug", { length }).notNull();

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `numeric(18,2)` — the storage type for every monetary amount (ADR-0003).
 *
 * `precision: 18, scale: 2` yields 16 integer digits plus 2 minor digits, which covers any
 * institutional amount in PKR. The scale is deliberate and matches `Money`'s in-memory scale.
 *
 * **The driver returns this as a `string`, not a `number`.** That is the mechanism that keeps money
 * exact: `pg` hands back PostgreSQL's canonical decimal text, and the application converts it with
 * `Money.fromDecimalText` / `Money.toDecimalText`. Never pass `{ mode: "number" }` — it reintroduces
 * the float rounding ADR-0003 exists to remove.
 *
 * `numeric` has no currency, so every table with a money column also has a `currencyCode` column.
 */
export const moneyAmount = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull();

/** A nullable money column, for the cases where "not set" is a real state (e.g. a rate override). */
export const optionalMoneyAmount = (name: string) => numeric(name, { precision: 18, scale: 2 });

/**
 * ISO 4217 alphabetic code. Stored as `varchar(3)` **plus** a check constraint, added by
 * {@link currencyCodeCheck}.
 *
 * `char(3)` would be the shorter way to reject `"PK"` — but PostgreSQL's `char(n)` blank-pads, so it
 * would silently turn a 2-character input into `"PK "`, which then compares unequal to every real
 * currency code and produces a value that looks valid in `psql`. A length limit plus an explicit
 * pattern gives the same rejection without the padding.
 *
 * `notNull()` because ADR-0003 requires currency to be explicit on every amount: a missing currency
 * is a missing fact, not a default.
 */
export const currencyCode = (name = "currency") => varchar(name, { length: 3 }).notNull();

/**
 * The constraint half of {@link currencyCode}, for tables that hold money.
 *
 * `varchar(3)` alone still admits `"123"`, `"pkr"` and `"PK "` — all of which would round-trip
 * through the `Money` type successfully and then be wrong. The pattern is exactly three uppercase
 * letters, which is the ISO 4217 alphabetic form the application validates against.
 *
 * It is exported as a builder rather than folded into {@link currencyCode} because Drizzle `check`
 * constraints live in a table's config array, not on a column.
 */
export const currencyCodeCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} ~ '^[A-Z]{3}$'`);

/* -------------------------------------------------------------------------- */
/* Enumerated text columns                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Free-form *description* text — `text`, with no length limit.
 *
 * `RULES.md` §13 asks for real concepts rather than truncation-friendly sizes. A description is
 * entered by a human and read by a human; truncating one silently is worse than an unindexed long
 * value, because the truncation is invisible at write time and visible only in a record the user did
 * not know was clipped. Nothing here queries descriptions, so the missing `text_pattern_ops` index
 * costs nothing.
 */
export const description = (name = "description") => text(name);

/** A person's given name / family name. 120 allows long legal names without a migration. */
export const personName = (name: string) => varchar(name, { length: 120 }).notNull();

/** An optional person's middle name. */
export const optionalPersonName = (name: string) => varchar(name, { length: 120 });

/** A short display label: class name, section name, subject name, role name. */
export const shortName = (name: string) => varchar(name, { length: 160 }).notNull();

/**
 * An e-mail address, lower-cased.
 *
 * Normalisation is the application's job (`src/shared/validation/fields.ts` lower-cases before
 * validating). The column does not add a `citext` dependency; `ci()` is declared per table where
 * uniqueness depends on it.
 */
export const emailAddress = (name = "email") => varchar(name, { length: 320 }).notNull();

/** E.164 phone number, stored as text so `+92…` never loses its leading sign. */
export const phoneNumber = (name = "phone") => varchar(name, { length: 32 });

/** A URL. */
export const webUrl = (name: string) => varchar(name, { length: 2048 });

/* -------------------------------------------------------------------------- */
/* Optimistic-concurrency update helper                                       */
/* -------------------------------------------------------------------------- */

/**
 * The three columns every mutable-row update must write.
 *
 * Returning them from one place means "bump the version and the timestamp" cannot be done halfway.
 * A partial update that sets `updated_at` but not `version` re-enables the silent overwrite that
 * `version` exists to prevent, and it is invisible in review because both look plausible.
 */
export function versionedUpdate(currentVersion: number): {
  updatedAt: Date;
  version: number;
} {
  return { updatedAt: new Date(), version: currentVersion + 1 };
}
