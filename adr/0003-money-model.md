# ADR-0003 — Money is a shared Decimal value type with explicit currency; balances are computed

- **Status:** Accepted
- **Date:** 2026-09-30
- **Phase:** `PHASES.md` Phase 1, Step 1.6
- **Resolves:** `DOMAIN-MODEL.md` defects G-10 and G-11, open question 2
- **Depends on:** `adr/0001-authorization-model.md` (audit trail requirement, `RULES.md` §29)

---

## Context

`RULES.md` §29 is unambiguous: financial amounts must be exact decimal values, never floating
point, and every financial mutation must be authorized, validated, transactional and auditable.

The archived contract satisfied none of that in practice. It stored `amount`, `discountAmount`,
`paidAmount` and `outstandingAmount` as four independent, nullable `Decimal` columns, with:

- no guarantee that `outstanding = amount - discount - paid` (defect G-10);
- nullable columns, so a null silently meant either "not yet set" or "equal to amount";
- no `currency` column anywhere, so amounts from different currencies were indistinguishable;
- `receiptNumber` with no uniqueness constraint, so duplicate receipts were possible (defect G-11).

A stored `outstandingAmount` is the root problem. It is a derived value, and derived values stored
alongside their inputs drift — a partial refund, a cancelled discount, or a failed concurrent write
each leave the column lying. `RULES.md` §25 already states the design principle this ADR applies:
*separate entities, properties, and behaviours — never bundle them together to save time.*

## Decision

**1. Storage type.** Money columns are PostgreSQL `numeric`, declared in the contract as
`numeric(18,2)`. Never `float`, never a JS `number`. *Originally justified against the Prisma 8
`pg/numeric@1` codec; that ORM was never installed and the evidence is superseded — see
Amendments.*

**1a. There is no `Decimal` class in this stack, and the application value is a string.**
Originally verified 2026-09-30 by reading the shipped Prisma codec in
`@prisma/orm-target-postgres@8.0.0-rc.12`:

- `pgNumericDecode(wire)` returns the wire value unchanged when it is not a `number` — i.e. a
  **canonical decimal text string**, not a decimal object.
- `encodeJson` throws `RUNTIME.ENCODE_FAILED` unless the value is *"an optionally negated decimal
  numeral, or NaN, Infinity or -Infinity"*. A JS `number` is therefore **not** an acceptable
  application value for a `numeric` column.
- The codec exports a `Numeric` *type descriptor*, not a runtime decimal class. There is no
  `Decimal` export, and neither `decimal.js`, `decimal.js-light`, `bignumber.js` nor
  `@prisma/client-runtime` is installed in this project.

**Consequence:** exact decimal arithmetic cannot be delegated to the ORM. The application must own
it, which is what the shared value type below is for. This conclusion was re-verified against the
Drizzle + `pg` stack on 2026-10-06 and still holds — see Amendments.

**2. One shared value type.** `src/shared/money/` exposes a `Money` type backed by **integer minor
units at a fixed scale of 2**, converted to and from canonical decimal text at the storage
boundary:

```text
Money { amountMinor: bigint, currency: CurrencyCode }
  money.fromDecimalText("1250.50", "PKR")   -> 125050n minor units
  money.toDecimalText(m)                     -> "1250.50"
  money.add/ subtract / compare / allocate   -> exact; throws on currency mismatch
```

Arithmetic on `bigint` minor units is exact by construction, needs no third-party dependency, and
round-trips to the canonical text the driver requires. **Every binary operation throws
`CurrencyMismatchError` when the two currencies differ.** This is the enforcement mechanism:
`RULES.md` §29 demands exact decimal values, and a `Money` type makes an impure sum a thrown error
rather than a silently wrong PKR/USD total. Placing it in `shared/` is deliberate — `RULES.md` §7.3
restricts `shared/` to genuinely reusable code, and no module may implement its own money
arithmetic. Two modules disagreeing about rounding is the failure this prevents.

`fromDecimalText` rejects anything the codec would reject, and `toDecimalText` is the *only*
sanctioned way to produce a value for a `numeric` column, so an invalid amount cannot reach the
driver.

**3. Currency is explicit, never defaulted.** Every money document carries a `currency` code. There
is no implicit institution default at the storage layer, because a report spanning two currencies
must fail loudly rather than sum across them. A system-level default may be applied at the
*boundary* when creating a record, and is written explicitly on that record.

*Implemented refinement:* the column lives on the document root and child rows inherit it in one
hop, rather than every amount row repeating it. See Amendments.

**4. Balances are computed, not stored.** `outstandingAmount` is not a column. It is derived as
`amount − discount − paid` at read time by the finance domain. If a read cost ever makes that
unacceptable, the correct fix is a materialized view or cache — never a denormalized column that
can drift from its inputs.

**5. Totals are non-null and validated.** `amount` and `currency` are required. `discount` and
`paid` default to `0` (a `Money` zero in the same currency) rather than being nullable, removing
the null-means-anything ambiguity. Invariants are enforced in the finance domain and re-checked as
database constraints.

**6. Receipt numbers are unique per institution.** Fixed alongside the archived defect G-11.

**7. Every mutation is transactional and audited.** Fee creation, payment recording, discount
approval and any refund each run in a transaction and write an audit entry with before/after
`Money` values (`RULES.md` §29, §34).

**8. No new dependency.** `decimal.js` is deliberately **not** added. The arithmetic needed is
`+`, `-`, comparison and a proportional split, all of which are exact on `bigint` minor units.
Adding a general-purpose decimal library to avoid a ~120-line exact type would be the kind of
dependency `RULES.md` §3.5 and the global dependency policy caution against. If a future
requirement needs transcendental or arbitrary-precision operations, this decision is revisited
then, not pre-emptively.

## Consequences

**Positive**

- Fixes G-10 by removing the drift-prone column rather than trying to police it.
- Fixes G-11 with an explicit uniqueness constraint.
- Mixed-currency arithmetic becomes a type/runtime error, not a wrong number in a report.
- One rounding rule for the whole system, in one place, reviewable in one place.
- Audit entries compare `Money` values directly, so a diff is meaningful.

**Negative / accepted costs**

- Slight read cost: outstanding balance is computed per read instead of read from a column. The
  arithmetic is trivial and indexed; this is a deliberate correctness-over-micro-optimization trade.
- Every amount field gains a currency, so forms and APIs carry more data. Deliberate — it is what
  makes a mixed report detectable.
- `Money` is a small abstraction that use cases must import correctly. Its placement in `shared/`
  plus a test suite is what keeps it honest.

**Follow-on obligations**

- Phase 3 gives every money column `numeric(18,2)` + a currency reachable in one hop, and makes
  totals non-null. Done — 145 tables shipped; see Amendments.
- Phase 2 Step 2.6 implements `src/shared/money/` with round-half-up tests, currency-mismatch
  rejection, and the G-10 invariant test.

**Scale-2 limitation, stated openly.** `numeric(18,2)` assumes two-decimal currencies, correct for
PKR, USD, GBP and EUR. Zero-decimal currencies (JPY, KRW) and three-decimal currencies (KWD, BHD)
would need per-currency scale, which this ADR does not implement. The school operates in PKR;
if multi-currency with KWD-class currencies is ever required, this ADR must be revisited rather
than quietly widened.

---

## Amendments

**2026-10-06 — Phase 3 implementation.** The ADR's decision stands; three facts in it were written
before the data layer was chosen and are corrected here rather than left to mislead.

1. **The ORM is Drizzle, not Prisma.** Prisma was never installed. The §1a conclusion was
   re-verified in the shipped packages, not assumed:
   - `drizzle-orm/pg-core/columns/numeric.js` — `PgNumeric.mapFromDriverValue(value)` returns
     `value` unchanged when it is a `string`, otherwise `String(value)`. The declared TS type is
     therefore `string`, and there is no decimal object anywhere in the read path.
   - `pg-types@2.2.0` — `builtins.js` maps `NUMERIC: 1700`, but `textParsers.js` registers **no**
     parser for 1700, so a text-format result passes through as its canonical decimal text. The one
     registered `parseNumeric` is in `binaryParsers.js` and only applies to binary-format results,
     which this driver does not request.
   - Net effect: unchanged. The application owns the arithmetic, which is what `Money` is for.

2. **Currency is stored once per document, not once per amount.** §3 as originally written reads as
   "every money column carries a `currency` code". The implementation puts `currency` on each money
   *root* — 14 tables: `salary_structures`, `salary_assignments`, `fee_structures`, `fee_invoices`,
   `payments`, `receipts`, `fee_payment_plans`, `fee_concessions`, `financial_accounts`, `expenses`,
   `budgets`, `payroll_runs`, `payroll_items`, `payroll_payments`. The 8 money-bearing tables without the column
   reach it by joining one hop — `fee_structure_items`, `fee_invoice_lines`, `payment_allocations`,
   `fee_installments`, `ledger_entries`, `payroll_adjustments`, `bank_reconciliations`,
   `payment_methods`. The intent of §3 is preserved and the drift risk is *lower*, because the
   currency can no longer disagree with itself across the lines of one document.
   `src/db/schema/schema-contract.test.ts` asserts every money column is `numeric(18,2)` and that each
   money row reaches a currency within one hop, so the invariant is now enforced rather than merely
   stated. Note the cost: reading the currency of a child row costs a join, and `MEMORY.md` §5 records
   the parent for each of the eight so nobody has to rediscover it.

3. **§5 and §6 are implemented as constraints, not only domain checks.** Required amounts are
   `NOT NULL` (the `moneyAmount()` helper) and carry a `> 0` check where a zero or negative figure
   would be a bug; genuinely optional figures such as `fee_structure_items.override_amount` or
   `payments.overpayment_amount` are deliberately nullable. `outstandingAmount` exists nowhere in
   the schema, and `receipts_number_key` makes `receipt_number` unique per institution. Of these,
   only the `numeric(18,2)` shape and the one-hop currency rule are asserted by
   `schema-contract.test.ts` — the rest is enforced by the migration itself and would surface as a
   failed `pnpm db:migrate`, not as a failing test.

**Unchanged and still open:** the scale-2 limitation below. Nothing in Phase 3 introduced a
per-currency scale.

---

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Integer minor units (e.g. paisa) | Rejected **as a storage choice** for a standalone reason: it locks each amount to one currency's scale and makes any currency change a data migration. It is nonetheless what `Money` uses *in memory*, because the driver provides no decimal object to compute with. Storage stays `numeric`, so the migration objection does not apply. |
| Rely on a `Decimal` class from the ORM | **Does not exist in this stack.** The driver returns canonical decimal text and rejects non-text application values. Confirmed 2026-09-30 against Prisma, re-confirmed 2026-10-06 against Drizzle + `pg`. |
| Add `decimal.js` | Unnecessary: `+`, `-`, comparison and proportional split are exact on `bigint` minor units. A general-purpose decimal library is a dependency this domain does not need. |
| Plain `Decimal` per column, no wrapper | Fewest abstractions, but nothing stops two modules implementing different rounding, and nothing detects mixed-currency sums. Recreates G-10 at a different layer. |
| Store `outstandingAmount` and reconcile in a job | Recreates G-10: the stored value drifts and a reconciliation pass becomes load-bearing for correctness. |
| Single system currency with no per-row `currency` | Simplest schema, but makes a mixed-currency report silently wrong instead of loudly impossible. |
| Money as a plain number with unit tests only | Tests cannot enforce a rule at every call site; the type can. |
