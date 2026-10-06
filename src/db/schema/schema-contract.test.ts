import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./index";

/**
 * Schema contract tests.
 *
 * These are invariants of the *database*, not of any one table. Each one below encodes a rule that
 * PostgreSQL enforces only at `CREATE TABLE` time or not at all, which means a mistake here survives
 * typecheck, lint and `drizzle-kit generate` and surfaces as a failed migration or, worse, as a runtime
 * error on a code path nobody exercised.
 *
 * The rules exist because each of them has already been violated at least once in this schema:
 *
 * - `announcement_audiences` once had `audience_id` in a composite primary key. A primary-key column is
 *   implicitly `NOT NULL` in PostgreSQL, so the constraint rejected the `everyone` row that the check
 *   constraint beside it explicitly permitted — an impossible schema that no test would have caught.
 * - `monthly_test_reports` once had a plain unique index on `(student, subject, session, period)` while
 *   documenting that a recomputation inserts a *replacement* report. The index forbade the replacement.
 * - `floor_live_snapshots` was the one table without a primary key.
 *
 * Read `MEMORY.md` before adding a table: a new table is where these rules are most likely to be broken.
 */

const DRIZZLE_NAME = Symbol.for("drizzle:Name");

interface ColumnInfo {
  name: string;
  sql: string;
  kind: string;
  notNull: boolean;
  primary: boolean;
}

interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencesTable: string;
  referencesColumns: string[];
}

interface TableInfo {
  /** SQL table name. */
  name: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  /** Column-name tuples PostgreSQL will accept as an FK target: primary keys plus unique constraints. */
  uniqueKeys: string[][];
  /** Column-name tuples that the table declares as *the* primary key. */
  primaryKeyColumns: string[][];
  indexNames: string[];
  primaryKeyCount: number;
}

const sqlNameOf = (table: unknown): string =>
  (table as { [DRIZZLE_NAME]?: string })[DRIZZLE_NAME] ?? "<unresolved table>";

function inspect(): Map<string, TableInfo> {
  const tables = new Map<string, TableInfo>();

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;

    const config = getTableConfig(value) as unknown as {
      name: string;
      columns: Array<{
        name: string;
        getSQLType(): string;
        columnType: string;
        notNull: boolean;
        primary: boolean;
      }>;
      indexes: Array<{
        config: { name: string; unique: boolean; columns: Array<{ name: string }> };
      }>;
      primaryKeys: Array<{ columns: Array<{ name: string }> }>;
      uniqueConstraints: Array<{ name: string; columns: Array<{ name: string }> }>;
      foreignKeys: Array<{
        getName(): string;
        reference(): {
          columns: Array<{ name: string }>;
          foreignTable: unknown;
          foreignColumns: Array<{ name: string }>;
        };
      }>;
    };

    const columnPrimaryKeys = config.columns.filter((c) => c.primary).map((c) => [c.name]);
    const compositePrimaryKeys = config.primaryKeys.map((pk) => pk.columns.map((c) => c.name));
    // Only primary keys and unique *constraints* count as FK targets. drizzle-kit emits
    // `CREATE UNIQUE INDEX` after every `ALTER TABLE ... ADD FOREIGN KEY`, so a table whose only
    // unique key is an index fails at apply time with "there is no unique constraint matching
    // given keys" — which is how `job_definitions.job_type` broke the first baseline migration.
    const uniqueKeys = [
      ...columnPrimaryKeys,
      ...compositePrimaryKeys,
      ...config.uniqueConstraints.map((uc) => uc.columns.map((c) => c.name)),
    ];

    tables.set(config.name, {
      name: config.name,
      columns: config.columns.map((c) => ({
        name: c.name,
        sql: c.getSQLType(),
        kind: c.columnType,
        notNull: c.notNull,
        primary: c.primary,
      })),
      foreignKeys: config.foreignKeys.map((fk) => {
        const reference = fk.reference();
        return {
          name: fk.getName(),
          columns: reference.columns.map((c) => c.name),
          referencesTable: sqlNameOf(reference.foreignTable),
          referencesColumns: reference.foreignColumns.map((c) => c.name),
        };
      }),
      uniqueKeys,
      primaryKeyColumns: [...columnPrimaryKeys, ...compositePrimaryKeys],
      indexNames: config.indexes.map((i) => i.config.name),
      primaryKeyCount: columnPrimaryKeys.length + compositePrimaryKeys.length,
    });
  }

  return tables;
}

const tables = inspect();
const allTables = [...tables.values()];

/** Money is `numeric(18,2)`; these suffixes are what a money column is named like across the schema. */
const MONEY_NAME = /(^|_)(amount|balance|fee|salary|price|tax|deduction|deductions)$/;

/**
 * Audit and notification actors: `*_by_user_id`, `*_to_user_id` and the two
 * profile-qualified variants. Deliberately bare so that deleting a user does not delete the record
 * of who acted — the audit trail is the point of the column.
 */
const ACTOR_COLUMNS = [
  "admission_checklist_completions.completed_by_user_id",
  "admission_documents.verified_by_user_id",
  "admission_status_history.changed_by_user_id",
  "admissions.decided_by_user_id",
  "attendance_corrections.corrected_by_user_id",
  "attendance_exceptions.resolved_by_user_id",
  "attendance_records.marked_by_user_id",
  "attendance_sessions.opened_by_user_id",
  "attendance_sessions.submitted_by_user_id",
  "bank_reconciliations.reconciled_by_user_id",
  "biometric_enrollments.enrolled_by_user_id",
  "biometric_enrollments.revoked_by_user_id",
  "budgets.approved_by_user_id",
  "class_subjects.created_by_user_id",
  "dead_letter_jobs.acknowledged_by_user_id",
  "dead_letter_jobs.resolved_by_user_id",
  "diaries.assigned_by_teacher_user_id",
  "diary_assignments.acknowledged_by_user_id",
  "diary_attachments.uploaded_by_user_id",
  "employee_attendance.marked_by_user_id",
  "employee_documents.verified_by_user_id",
  "employee_status_history.changed_by_user_id",
  "expenses.approved_by_user_id",
  "expenses.requested_by_user_id",
  "extra_periods.approved_by_user_id",
  "extra_periods.created_by_user_id",
  "fee_concessions.granted_by_user_id",
  "fee_concessions.revoked_by_user_id",
  "fee_deferrals.approved_by_user_id",
  "fee_deferrals.requested_by_guardian_user_id",
  "fee_deferrals.requested_by_user_id",
  "fee_invoices.issued_by_user_id",
  "fee_payment_plans.approved_by_user_id",
  "fee_structure_audit.changed_by_user_id",
  "financial_periods.closed_by_user_id",
  "floor_incident_reports.escalated_to_user_id",
  "floor_incident_reports.reported_by_user_id",
  "floor_incident_reports.resolved_by_user_id",
  "guardian_authorizations.granted_by_user_id",
  "guardian_authorizations.revoked_by_user_id",
  "guardian_links.linked_by_user_id",
  "guardian_links.unlinked_by_user_id",
  "hr_announcements.created_by_user_id",
  "jobs.requested_by_user_id",
  "journal_transactions.posted_by_user_id",
  "journal_transactions.reversed_by_user_id",
  "leave_requests.decided_by_user_id",
  "leave_requests.requested_by_user_id",
  "payment_allocations.allocated_by_user_id",
  "payments.received_by_user_id",
  "receipts.issued_by_user_id",
  "role_permissions.granted_by_user_id",
  "salary_assignments.approved_by_user_id",
  "schedule_change_sets.created_by_user_id",
  "schedule_publish_history.published_by_user_id",
  "student_documents.verified_by_user_id",
  "student_notes.created_by_user_id",
  "student_placements.created_by_user_id",
  "teacher_absences.reported_by_user_id",
  "teacher_documents.verified_by_user_id",
  "teacher_subjects.verified_by_user_id",
];

/**
 * Polymorphic pointers: each has a sibling discriminator column
 * (`scope_type`, `audience_type`, `viewer_kind`, `corrects_record_type`, `source_type`, `eventKey`)
 * or a documented multi-target meaning, so a foreign key would name one of several tables and lie
 * about the others.
 */
const POLYMORPHIC_COLUMNS = [
  "announcement_audiences.audience_id",
  "diary_reads.viewer_id",
  "email_messages.related_entity_id",
  "notification_deliveries.audience_id",
  "notifications.audience_id",
  "notifications.related_entity_id",
  "payroll_adjustments.corrects_record_id",
  "payroll_calculation_sources.source_record_id",
  "permission_scopes.scope_id",
  "student_guardian_snapshots.notification_id",
];

/**
 * Verified cross-module cycles. Adding either key would import the target module back into the file
 * that declares the column and close a loop, which breaks module init — every schema file has to be
 * loadable on its own. Exactly two survive checking the import graph edge by edge:
 *
 * - `identity.ts` imports `institution.ts`, so `departments.headUserId` → `users` adds
 *   `institution → identity` against the existing `identity → institution`.
 * - `floor-operations.ts` imports `academic.ts` (it owns `extra_periods.replaces_schedule_id` →
 *   `schedules`), so `schedules.replacement_assignment_id` → `extra_periods` adds
 *   `academic → floor-operations` against the existing `floor-operations → academic`.
 *
 * Five columns documented here as cycles were checked and do not close one; they now sit in
 * `OMISSION_CANDIDATES`. Each reason is stated in the column's own comment in the source.
 */
const MODULE_CYCLE_COLUMNS = ["departments.head_user_id", "schedules.replacement_assignment_id"];

/**
 * `jobs.schedule_id` and `job_schedules.last_job_id` point at
 * each other. Either key alone would be fine; together they form a loop between two tables in one module.
 */
const SCHEDULE_CYCLE_COLUMNS = ["job_schedules.last_job_id", "jobs.schedule_id"];

/**
 * Target ambiguity. `ADR-0002` defines a teacher as a `User`
 * holding a `Teacher` profile, so `teacher_id` / `user_id` here could key either `users.id` or
 * `teachers.userId`, and the two are not interchangeable. Needs one decision, then the key.
 */
const AMBIGUOUS_TARGET_COLUMNS = [
  "class_teacher_assignments.teacher_id",
  "extra_periods.teacher_id",
  "floor_assignments.user_id",
  "floor_live_snapshots.substitute_teacher_id",
  "floor_live_snapshots.teacher_id",
  "schedules.teacher_id",
];

/**
 * No single column to point at: the attendance mark is keyed
 * on `(section, date, period, student)` and is owned by another module's join.
 */
const COMPOSITE_TARGET_COLUMNS = ["biometric_transactions.resolved_attendance_student_id"];

/**
 * A flag, not a relationship: set once by payroll so the
 * period cannot be paid twice. The value is written for its own existence, not read back as a join.
 */
const CONCURRENCY_MARKER_COLUMNS = ["extra_periods.consumed_by_pay_line_id"];

/**
 * Unexplained. Both shapes below are believed to be omissions rather than decisions:
 *
 * - The same column name carries a foreign key on dozens of other tables (`institution_id`,
 *   `academic_session_id`, `leave_request_id`, …), the target module is already imported by this
 *   one, and the source comment gives no reason for the gap.
 * - The column was documented as absent to break a module cycle, but checking the import graph
 *   shows no cycle would form: `finance` imports only `institution`, so neither
 *   `fees → finance` / `payroll → finance` nor `finance → fees` / `finance → payroll` closes a
 *   path, and no other reason is recorded anywhere in the schema.
 *
 * Listed so that a reviewer can see them; do not add a key without reading the table first.
 */
const OMISSION_CANDIDATES = [
  "attendance_exceptions.institution_id",
  "journal_transactions.payment_id",
  "journal_transactions.payroll_run_id",
  "payments.deposited_to_account_id",
  "payroll_payments.ledger_account_id",
  "payroll_runs.journal_transaction_id",
  "permissions.institution_id",
  "schedule_publish_history.schedule_id",
  "teacher_absences.leave_request_id",
  "teacher_leave_balances.academic_session_id",
  "teacher_leave_balances.leave_type_id",
  "teacher_workload_history.academic_session_id",
];

describe("schema contract", () => {
  it("declares the expected number of tables", () => {
    expect(tables.size).toBeGreaterThan(100);
  });

  describe("primary keys", () => {
    it("gives every table exactly one primary key", () => {
      const offenders = allTables
        .filter((t) => t.primaryKeyCount !== 1)
        .map((t) => `${t.name} has ${t.primaryKeyCount}`);
      expect(offenders).toEqual([]);
    });

    /**
     * A primary-key column is implicitly `NOT NULL` in PostgreSQL, so declaring one nullable makes the
     * table reject every row that relies on the null — silently, because the schema still typechecks and
     * still generates.
     */
    it("never puts a nullable column in a primary key", () => {
      const offenders: string[] = [];
      for (const table of allTables) {
        for (const key of table.primaryKeyColumns) {
          for (const column of key) {
            const found = table.columns.find((c) => c.name === column);
            if (found && !found.notNull) offenders.push(`${table.name}.${column}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("foreign keys", () => {
    /**
     * PostgreSQL requires the referenced columns to carry a unique constraint. Without this test the
     * failure is a `CREATE TABLE` error in the generated migration, discovered at deploy time.
     */
    it("targets a unique key on the referenced table", () => {
      const offenders: string[] = [];
      for (const table of allTables) {
        for (const fk of table.foreignKeys) {
          const target = tables.get(fk.referencesTable);
          if (!target) {
            offenders.push(
              `${table.name}.${fk.columns} references unknown table ${fk.referencesTable}`,
            );
            continue;
          }
          const isKey = target.uniqueKeys.some((key) => key.join() === fk.referencesColumns.join());
          if (!isKey) {
            offenders.push(
              `${table.name}(${fk.columns}) -> ${fk.referencesTable}(${fk.referencesColumns}) is not unique`,
            );
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it("gives every constraint a schema-unique name", () => {
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const table of allTables) {
        for (const name of [...table.foreignKeys.map((f) => f.name), ...table.indexNames]) {
          if (seen.has(name)) duplicates.push(name);
          seen.add(name);
        }
      }
      expect(duplicates).toEqual([]);
    });
  });

  describe("money", () => {
    it("stores every money column as exact numeric(18,2)", () => {
      const offenders = allTables
        .flatMap((table) =>
          table.columns
            .filter((c) => c.kind === "PgNumeric" && MONEY_NAME.test(c.name))
            .map((c) => `${table.name}.${c.name} is ${c.sql}`),
        )
        .filter((message) => !message.endsWith("is numeric(18, 2)"));
      expect(offenders).toEqual([]);
    });

    /**
     * Currency lives on the money *document* — the invoice, the payment, the payroll item — and its child
     * rows inherit it. This asserts the inheritance is never more than one hop from a row that declares a
     * currency, so no amount can end up with no currency at all.
     */
    it("gives every money row a currency, directly or from its parent", () => {
      const offenders: string[] = [];
      for (const table of allTables) {
        const hasMoney = table.columns.some(
          (c) => c.kind === "PgNumeric" && MONEY_NAME.test(c.name),
        );
        if (!hasMoney) continue;
        if (table.columns.some((c) => c.name === "currency" || c.name.endsWith("_currency")))
          continue;
        const inherits = table.foreignKeys.some((fk) => {
          const parent = tables.get(fk.referencesTable);
          return (
            parent?.columns.some((c) => c.name === "currency" || c.name.endsWith("_currency")) ===
            true
          );
        });
        if (!inherits) offenders.push(table.name);
      }
      expect(offenders).toEqual([]);
    });
  });

  /**
   * Every uuid column in the schema is either a primary key, carries a foreign key, or appears in one
   * of the allowlists below. The allowlist is what makes the 95 remaining gaps *reviewable*: a column
   * can only be added to the schema without a key by also being added here, in a named group, where a
   * reviewer will see it.
   *
   * A failure in either direction is meaningful. An `extra` entry means a bare column gained a key and
   * the allowlist is stale — delete it. A `missing` entry means a new table or column shipped without a
   * key and without a decision — that is the case that must not reach production silently.
   */
  describe("uuid columns without a foreign key", () => {
    const ALLOWED = [
      ...ACTOR_COLUMNS,
      ...POLYMORPHIC_COLUMNS,
      ...MODULE_CYCLE_COLUMNS,
      ...SCHEDULE_CYCLE_COLUMNS,
      ...AMBIGUOUS_TARGET_COLUMNS,
      ...COMPOSITE_TARGET_COLUMNS,
      ...CONCURRENCY_MARKER_COLUMNS,
      ...OMISSION_CANDIDATES,
    ];

    const bare = allTables
      .flatMap((table) => {
        const keyColumns = new Set(table.primaryKeyColumns.flat());
        const fkColumns = new Set(table.foreignKeys.flatMap((fk) => fk.columns));
        return table.columns
          .filter((c) => c.kind === "PgUUID" && !keyColumns.has(c.name) && !fkColumns.has(c.name))
          .map((c) => `${table.name}.${c.name}`);
      })
      .sort();

    it("partitions the allowlist with no duplicates", () => {
      expect(new Set(ALLOWED).size).toBe(ALLOWED.length);
    });

    it("agrees exactly with the schema", () => {
      const allowed = [...ALLOWED].sort();
      expect({
        missing: allowed.filter((c) => !bare.includes(c)),
        extra: bare.filter((c) => !allowed.includes(c)),
      }).toEqual({ missing: [], extra: [] });
    });

    it("accounts for every uuid column in the schema exactly once", () => {
      let total = 0;
      let primaryKeys = 0;
      let withKey = 0;
      let withoutKey = 0;
      for (const table of allTables) {
        const keyColumns = new Set(table.primaryKeyColumns.flat());
        const fkColumns = new Set(table.foreignKeys.flatMap((fk) => fk.columns));
        for (const column of table.columns) {
          if (column.kind !== "PgUUID") continue;
          total += 1;
          if (keyColumns.has(column.name)) primaryKeys += 1;
          else if (fkColumns.has(column.name)) withKey += 1;
          else withoutKey += 1;
        }
      }
      expect(withoutKey).toBe(bare.length);
      expect(primaryKeys + withKey + withoutKey).toBe(total);
    });
  });

  describe("documented design decisions", () => {
    /**
     * Regression guard. `monthly_test_reports` is versioned by supersession: a recomputation inserts a
     * replacement and points the old row at it. A plain unique index on
     * `(student, subject, session, period)` would forbid that replacement, so the index must be partial
     * on live rows.
     */
    it("permits a superseding monthly test report for the same period", () => {
      expect(readMigrationStatement("monthly_test_reports_unique")).toContain("WHERE");
    });

    /**
     * Regression guard. `announcement_audiences.audience_id` is null for `everyone`, so uniqueness has to
     * be two partial indexes — a primary key or a plain unique index would either reject the `everyone`
     * row or let duplicates through, because `NULL`s are distinct in a btree.
     */
    it("allows exactly one everyone row and one row per concrete audience", () => {
      const everyone = readMigrationStatement("announcement_audiences_everyone_key");
      const target = readMigrationStatement("announcement_audiences_target_key");
      expect(everyone).toContain("WHERE");
      expect(target).toContain("WHERE");
    });

    /**
     * Regression guard. Slip numbers are tenant-scoped: the same number may exist at two institutions, so
     * the unique index must include `institution_id`.
     */
    it("scopes payroll slip numbers per institution", () => {
      const statement = readMigrationStatement("payroll_payslips_number_key");
      expect(statement).toContain("institution_id");
      expect(statement).toContain("slip_number");
    });
  });
});

/**
 * Returns the generated migration statement containing `identifier`.
 *
 * The migration file name is derived from the journal rather than hardcoded, because
 * `drizzle-kit generate` renames the file whenever the schema changes — a hardcoded name would turn the
 * next regeneration into a failing test for no reason.
 */
function readMigrationStatement(identifier: string): string {
  const drizzleDir = fileURLToPath(new URL("../../../drizzle", import.meta.url));
  const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const sql = journal.entries
    .map((entry) => readFileSync(join(drizzleDir, `${entry.tag}.sql`), "utf8"))
    .join("\n");
  const statement = sql
    .split("--> statement-breakpoint")
    .find((candidate) => candidate.includes(identifier));
  if (statement === undefined) {
    throw new Error(`no generated migration statement for ${identifier}`);
  }
  return statement;
}
