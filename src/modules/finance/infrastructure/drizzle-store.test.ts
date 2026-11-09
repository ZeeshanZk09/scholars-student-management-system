/**
 * Unit tests for the finance store's *pure* helpers — `normalizePaging` and `signedMovement`.
 *
 * Nothing here touches a database: the helpers are deliberately free of `db`/`drizzle-orm` so
 * the store's pagination bounds and `byKind` sign rules are verified without a harness
 * (`MEMORY.md`: vitest never connects to Postgres in this repo). Behaviour that needs rows —
 * tenancy, versioning, the period check — is covered by `finance-service.test.ts` against
 * `testing/fakes.ts`, which mirrors this store's observable semantics.
 */
import { describe, expect, it } from "vitest";

import { toDecimalText } from "@/shared/money";

import { normalizePaging, signedMovement } from "./drizzle-store";

describe("normalizePaging", () => {
  it("defaults to page 1 and pageSize 50 when absent", () => {
    expect(normalizePaging()).toEqual({ page: 1, pageSize: 50 });
  });

  it("keeps an explicit in-range page and size", () => {
    expect(normalizePaging(3, 25)).toEqual({ page: 3, pageSize: 25 });
  });

  it("floors fractional inputs rather than passing them to LIMIT/OFFSET", () => {
    expect(normalizePaging(2.9, 10.7)).toEqual({ page: 2, pageSize: 10 });
  });

  it("clamps a pageSize above the 200 cap", () => {
    expect(normalizePaging(1, 10_000)).toEqual({ page: 1, pageSize: 200 });
  });

  it("falls back to the defaults for zero or negative inputs", () => {
    expect(normalizePaging(0, 0)).toEqual({ page: 1, pageSize: 50 });
    expect(normalizePaging(-1, -5)).toEqual({ page: 1, pageSize: 50 });
  });
});

describe("signedMovement", () => {
  it("is positive for a fee collection", () => {
    expect(toDecimalText(signedMovement("fee_collection", "100.00", "PKR", null))).toBe("100.00");
  });

  it("is positive for a recognised expense", () => {
    expect(toDecimalText(signedMovement("expense", "40.50", "PKR", null))).toBe("40.50");
  });

  it("flips a refund's sign", () => {
    expect(toDecimalText(signedMovement("refund", "25.00", "PKR", null))).toBe("-25.00");
  });

  it("flips every reversal's sign", () => {
    expect(toDecimalText(signedMovement("expense", "40.50", "PKR", "journal-1"))).toBe("-40.50");
    expect(toDecimalText(signedMovement("income", "10.00", "PKR", "journal-1"))).toBe("-10.00");
  });

  it("nets a refund reversal back to positive", () => {
    expect(toDecimalText(signedMovement("refund", "25.00", "PKR", "journal-1"))).toBe("25.00");
  });
});
