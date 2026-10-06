/**
 * Exact money arithmetic, per `adr/0003-money-model.md`.
 *
 * A `Money` amount is a `bigint` count of minor units at a fixed scale of 2. This is exact by
 * construction, needs no decimal dependency, and round-trips to the canonical decimal text that the
 * database's `numeric` column yields as its application value — Drizzle's `numeric()` maps to a JS
 * `string` precisely so that no precision is lost on the way out of the driver, so there is no
 * `Decimal` class in this stack to defer to.
 *
 * Never represent money as a JS `number`. Every binary operation throws on a currency mismatch, so a
 * mixed-currency total fails loudly instead of being silently wrong.
 *
 * This project targets ES2017, where bigint literals (`0n`) are unavailable, hence `BigInt(0)`.
 */
import { BusinessRuleError, ValidationError } from "../errors";

/** Minor units per major unit. Fixed at 2 — correct for PKR, USD, GBP and EUR. */
const SCALE = 2;

const ZERO = BigInt(0);
const ONE = BigInt(1);
const MINOR_PER_MAJOR = BigInt(10) ** BigInt(SCALE);

/** Plain decimal numeral, optionally negated. Stricter than a bare numeric parse on purpose. */
const CANONICAL_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

const CURRENCY_CODE = /^[A-Za-z]{3}$/;

/**
 * A validated ISO 4217 alphabetic code.
 *
 * `ADR-0003` requires currency to be explicit on every amount and requires a mixed-currency sum to
 * fail loudly. A branded type is what makes that hold at the edges: the only way to obtain one is
 * `normalizeCurrency`, so a code that reached `Money` was pattern-checked and upper-cased, and a
 * caller cannot construct `{ currency: "PKR " }` by hand and pass it on.
 */
export type CurrencyCode = string & { readonly __brand: unique symbol };

function normalizeCurrency(currency: string): CurrencyCode {
  if (!CURRENCY_CODE.test(currency)) {
    throw new ValidationError(`Invalid currency code: ${currency}`, {
      currency: ["Must be a 3-letter ISO 4217 code, e.g. PKR."],
    });
  }
  return currency.toUpperCase() as CurrencyCode;
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new BusinessRuleError(`Cannot combine ${left.currency} with ${right.currency}`, {
      userMessage: `This calculation mixes ${left.currency} and ${right.currency}. Convert the amount to a single currency first.`,
      details: { left: left.currency, right: right.currency },
    });
  }
}

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

/** Zero in the given currency. The safe default for an unset discount or paid amount. */
export function zero(currency: string): Money {
  return { amountMinor: ZERO, currency: normalizeCurrency(currency) };
}

function invalidAmount(received: string, reason: string): ValidationError {
  return new ValidationError(
    `Invalid money amount: ${reason}`,
    { amount: [reason] },
    // `received` is log context only. It stays out of the user-facing projection, since it echoes
    // raw input that a UI would render.
    { details: { received } },
  );
}

/**
 * Parse canonical decimal text into minor units.
 *
 * Rejects exponents, a leading `+`, leading zeros, whitespace, and the `NaN`/`Infinity` values a
 * permissive numeric parse would technically accept — money is never any of those.
 */
export function fromDecimalText(amount: string, currency: string): Money {
  const code = normalizeCurrency(currency);

  if (typeof amount !== "string" || !CANONICAL_DECIMAL.test(amount)) {
    throw invalidAmount(String(amount), "Expected a plain decimal numeral such as 1250.50.");
  }

  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const dot = unsigned.indexOf(".");
  const whole = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const fraction = dot === -1 ? "" : unsigned.slice(dot + 1);

  if (fraction.length > SCALE) {
    throw invalidAmount(
      amount,
      `Has ${fraction.length} decimal places; at most ${SCALE} are representable.`,
    );
  }

  const minor = BigInt(whole) * MINOR_PER_MAJOR + BigInt(fraction.padEnd(SCALE, "0"));

  return { amountMinor: negative ? -minor : minor, currency: code };
}

/** Build from a whole count of minor units. Rejects any fractional or unsafe value. */
export function fromMinorUnits(amountMinor: number, currency: string): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw invalidAmount(
      String(amountMinor),
      "Must be a safe whole number of minor units, e.g. 125050 for 1250.50.",
    );
  }
  return { amountMinor: BigInt(amountMinor), currency: normalizeCurrency(currency) };
}

/** The only sanctioned way to produce a value for a `numeric` column. */
export function toDecimalText(money: Money): string {
  const { amountMinor } = money;
  const sign = amountMinor < ZERO ? "-" : "";
  const absolute = amountMinor < ZERO ? -amountMinor : amountMinor;
  const whole = (absolute / MINOR_PER_MAJOR).toString();
  const fraction = (absolute % MINOR_PER_MAJOR).toString().padStart(SCALE, "0");
  return `${sign}${whole}.${fraction}`;
}

export function add(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return { amountMinor: left.amountMinor + right.amountMinor, currency: left.currency };
}

export function subtract(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return { amountMinor: left.amountMinor - right.amountMinor, currency: left.currency };
}

export function negate(money: Money): Money {
  return { amountMinor: -money.amountMinor, currency: money.currency };
}

export function isZero(money: Money): boolean {
  return money.amountMinor === ZERO;
}

export function isNegative(money: Money): boolean {
  return money.amountMinor < ZERO;
}

export function equals(left: Money, right: Money): boolean {
  assertSameCurrency(left, right);
  return left.amountMinor === right.amountMinor;
}

/** -1, 0 or 1. Throws on a currency mismatch rather than comparing across currencies. */
export function compare(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);
  if (left.amountMinor < right.amountMinor) return -1;
  if (left.amountMinor > right.amountMinor) return 1;
  return 0;
}

export function max(left: Money, right: Money): Money {
  return compare(left, right) >= 0 ? left : right;
}

export function min(left: Money, right: Money): Money {
  return compare(left, right) <= 0 ? left : right;
}

/** Total of an empty list is zero, not an error. */
export function sum(values: readonly Money[], currency: string): Money {
  const code = normalizeCurrency(currency);
  let total = ZERO;
  for (const value of values) {
    if (value.currency !== code) {
      throw new BusinessRuleError(`Cannot sum ${value.currency} into ${code}`, {
        userMessage: `This total mixes ${value.currency} and ${code} amounts. Convert them to a single currency first.`,
        details: { found: value.currency, expected: code },
      });
    }
    total += value.amountMinor;
  }
  return { amountMinor: total, currency: code };
}

/**
 * Split into `count` parts that sum exactly back to the original — no minor unit lost or invented.
 *
 * Remainder units go one each to the leading parts. Correct for negative amounts too: the split is
 * computed on the absolute value and re-signed, so `-10.00` across 3 parts is
 * `-3.34 / -3.33 / -3.33`.
 */
export function allocate(money: Money, count: number): Money[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new ValidationError(`Cannot split into ${count} parts`, {
      count: ["Must be a positive whole number of parts."],
    });
  }

  const negative = money.amountMinor < ZERO;
  const absolute = negative ? -money.amountMinor : money.amountMinor;
  const base = absolute / BigInt(count);
  const remainder = Number(absolute % BigInt(count));

  return Array.from({ length: count }, (_unused, index) => {
    const share = index < remainder ? base + ONE : base;
    return {
      amountMinor: negative ? -share : share,
      currency: money.currency,
    };
  });
}
