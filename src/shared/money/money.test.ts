import { describe, expect, it } from "vitest";
import { toClientError } from "../errors";
import {
  add,
  allocate,
  compare,
  equals,
  fromDecimalText,
  fromMinorUnits,
  isNegative,
  isZero,
  max,
  min,
  negate,
  subtract,
  sum,
  toDecimalText,
  zero,
} from "./money";

const pkr = (text: string) => fromDecimalText(text, "PKR");
const usd = (text: string) => fromDecimalText(text, "USD");

/** The projection a user actually sees. `Error.message` is for logs, per RULES.md section 35. */
function clientErrorOf(thunk: () => unknown): unknown {
  try {
    thunk();
  } catch (error) {
    return toClientError(error);
  }
  throw new Error("expected the call to throw");
}

describe("parsing", () => {
  it("parses whole and fractional amounts into minor units", () => {
    expect(pkr("0").amountMinor).toBe(BigInt(0));
    expect(pkr("1250").amountMinor).toBe(BigInt(125_000));
    expect(pkr("1250.5").amountMinor).toBe(BigInt(125_050));
    expect(pkr("1250.50").amountMinor).toBe(BigInt(125_050));
    expect(pkr("0.01").amountMinor).toBe(BigInt(1));
  });

  it("parses negative amounts", () => {
    expect(pkr("-1250.50").amountMinor).toBe(BigInt(-125_050));
    expect(isNegative(pkr("-0.01"))).toBe(true);
  });

  it("is exact where a float would not be", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point.
    expect(toDecimalText(add(pkr("0.1"), pkr("0.2")))).toBe("0.30");
    // A large amount stays exact; Number would lose minor units.
    expect(toDecimalText(pkr("99999999999999.99"))).toBe("99999999999999.99");
  });

  it("normalizes currency case and rejects malformed codes", () => {
    expect(fromDecimalText("10.00", "pkr").currency).toBe("PKR");
    expect(pkr("10.00").currency).toBe("PKR");
    for (const bad of ["PK", "PKRX", "123", ""]) {
      expect(() => fromDecimalText("10.00", bad), bad).toThrow(/Invalid currency code/);
    }
  });

  it("explains a bad currency code on the user-facing surface", () => {
    // `Error.message` is for logs; the user reads userMessage/fieldErrors (RULES.md section 35).
    expect(clientErrorOf(() => fromDecimalText("10.00", "PK"))).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { currency: ["Must be a 3-letter ISO 4217 code, e.g. PKR."] },
    });
  });

  it("rejects amounts the Prisma numeric codec would also reject, plus floats", () => {
    // Exponents, leading '+', leading zeros, whitespace, and non-strings.
    for (const bad of ["1e3", "+1.00", "01.00", " 1.00", "1.00 ", ".5", "1.", "NaN", "Infinity"]) {
      expect(() => pkr(bad), bad).toThrow();
    }
    expect(() => fromDecimalText(1.5 as unknown as string, "PKR")).toThrow();
  });

  it("rejects more than two decimal places rather than silently rounding", () => {
    expect(() => pkr("10.005")).toThrow(/decimal places/);
  });

  it("rejects a non-integer count of minor units", () => {
    expect(() => fromMinorUnits(125_050.5, "PKR")).toThrow(/whole number/);
    expect(() => fromMinorUnits(1.5, "PKR")).toThrow(/whole number/);
    expect(fromMinorUnits(125_050, "PKR").amountMinor).toBe(BigInt(125_050));
  });
});

describe("serialization", () => {
  it("always renders two decimal places, which the numeric codec requires", () => {
    expect(toDecimalText(pkr("0"))).toBe("0.00");
    expect(toDecimalText(pkr("5"))).toBe("5.00");
    expect(toDecimalText(pkr("5.1"))).toBe("5.10");
    expect(toDecimalText(pkr("-5.1"))).toBe("-5.10");
  });

  it("round-trips through text without drift", () => {
    for (const text of ["0.00", "0.01", "1250.50", "-1250.50", "99999999999999.99"]) {
      expect(toDecimalText(pkr(text))).toBe(text);
    }
  });
});

describe("currency safety", () => {
  it("refuses to add across currencies", () => {
    expect(() => add(pkr("100.00"), usd("100.00"))).toThrow(/Cannot combine PKR with USD/);
  });

  it("refuses to subtract, compare, max and min across currencies", () => {
    expect(() => subtract(pkr("100.00"), usd("1.00"))).toThrow(/Cannot combine/);
    expect(() => compare(pkr("100.00"), usd("1.00"))).toThrow(/Cannot combine/);
    expect(() => equals(pkr("100.00"), usd("100.00"))).toThrow(/Cannot combine/);
    expect(() => max(pkr("100.00"), usd("1.00"))).toThrow(/Cannot combine/);
    expect(() => min(pkr("100.00"), usd("1.00"))).toThrow(/Cannot combine/);
  });

  it("refuses to sum a mixed list and names the offending currency", () => {
    expect(() => sum([pkr("10.00"), usd("5.00")], "PKR")).toThrow(/Cannot sum USD into PKR/);
  });

  it("produces a user-safe message for a currency mismatch", () => {
    try {
      add(pkr("1.00"), usd("1.00"));
      expect.unreachable("expected a currency mismatch");
    } catch (error) {
      const client = (error as { toClientError: () => { code: string; message: string } })
        .toClientError();
      expect(client.code).toBe("BUSINESS_RULE");
      expect(client.message).toMatch(/Convert the amount to a single currency/);
    }
  });
});

describe("arithmetic", () => {
  it("adds and subtracts exactly", () => {
    expect(toDecimalText(add(pkr("1250.50"), pkr("49.50")))).toBe("1300.00");
    expect(toDecimalText(subtract(pkr("1250.50"), pkr("250.50")))).toBe("1000.00");
  });

  it("keeps arithmetic within one currency", () => {
    expect(add(pkr("1.00"), pkr("2.00")).currency).toBe("PKR");
  });

  it("negates and detects zero", () => {
    expect(toDecimalText(negate(pkr("1250.50")))).toBe("-1250.50");
    expect(toDecimalText(negate(negate(pkr("1250.50"))))).toBe("1250.50");
    expect(isZero(zero("PKR"))).toBe(true);
    expect(isZero(pkr("0.01"))).toBe(false);
  });

  it("compares and orders", () => {
    expect(compare(pkr("1.00"), pkr("2.00"))).toBe(-1);
    expect(compare(pkr("2.00"), pkr("1.00"))).toBe(1);
    expect(compare(pkr("1.00"), pkr("1.00"))).toBe(0);
    expect(toDecimalText(max(pkr("1.00"), pkr("2.00")))).toBe("2.00");
    expect(toDecimalText(min(pkr("1.00"), pkr("2.00")))).toBe("1.00");
  });

  it("sums an empty list to zero", () => {
    expect(toDecimalText(sum([], "PKR"))).toBe("0.00");
  });
});

describe("allocate", () => {
  it("conserves every minor unit", () => {
    const parts = allocate(pkr("10.00"), 3);
    expect(parts.map(toDecimalText)).toEqual(["3.34", "3.33", "3.33"]);
    expect(toDecimalText(sum(parts, "PKR"))).toBe("10.00");
  });

  it("divides evenly with no remainder", () => {
    expect(allocate(pkr("10.00"), 2).map(toDecimalText)).toEqual(["5.00", "5.00"]);
  });

  it("conserves minor units for negative amounts too", () => {
    const parts = allocate(pkr("-10.00"), 3);
    expect(toDecimalText(sum(parts, "PKR"))).toBe("-10.00");
  });

  it("handles a zero amount", () => {
    expect(allocate(pkr("0.00"), 4).every(isZero)).toBe(true);
  });

  it("rejects a non-positive or fractional part count", () => {
    for (const bad of [0, -1, 2.5]) {
      expect(() => allocate(pkr("10.00"), bad), String(bad)).toThrow(/Cannot split into/);
      expect(clientErrorOf(() => allocate(pkr("10.00"), bad)), String(bad)).toMatchObject({
        code: "VALIDATION",
        fieldErrors: { count: ["Must be a positive whole number of parts."] },
      });
    }
  });
});

describe("archived defect G-10 — outstanding is derived, never stored", () => {
  // The archive stored outstandingAmount beside its inputs, so it could drift. ADR-0003 makes it a
  // computed value. This is the invariant the old schema could not guarantee.
  it("computes outstanding as amount - discount - paid, exactly", () => {
    const cases: ReadonlyArray<readonly [string, string, string, string]> = [
      ["50000.00", "0.00", "0.00", "50000.00"],
      ["50000.00", "5000.00", "20000.00", "25000.00"],
      ["50000.00", "5000.00", "45000.00", "0.00"],
      ["0.01", "0.00", "0.00", "0.01"],
      ["50000.00", "0.01", "0.01", "49999.98"],
    ];

    for (const [amount, discount, paid, expected] of cases) {
      const outstanding = subtract(subtract(pkr(amount), pkr(discount)), pkr(paid));
      expect(toDecimalText(outstanding), `${amount} - ${discount} - ${paid}`).toBe(expected);
    }
  });

  it("surfaces an overpayment as a negative balance rather than a wrong positive", () => {
    const outstanding = subtract(pkr("100.00"), pkr("150.00"));
    expect(isNegative(outstanding)).toBe(true);
    expect(toDecimalText(outstanding)).toBe("-50.00");
  });
});
