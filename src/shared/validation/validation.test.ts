import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ERROR_CODES, toClientError, type ClientError } from "../errors";
import {
  currencyCode,
  decimalAmount,
  emailAddress,
  identifier,
  normalizePhone,
  optionalPositiveInt,
  parseOrThrow,
  phoneNumber,
  safeParse,
  wholeNumber,
} from "./index";

/** The projection a user sees. `Error.message` is for logs, per RULES.md section 35. */
function clientErrorOf(thunk: () => unknown): ClientError {
  try {
    thunk();
  } catch (error) {
    return toClientError(error);
  }
  throw new Error("expected the call to throw");
}

describe("parseOrThrow", () => {
  const schema = z.object({ email: emailAddress, age: wholeNumber("Age", 0, 130) });

  it("returns parsed data when valid", () => {
    // Zod 4 rejects a single-character TLD, so `a@b.c` is not a valid address here.
    expect(parseOrThrow(schema, { email: "  A@B.CO ", age: 20 })).toEqual({
      email: "a@b.co",
      age: 20,
    });
  });

  it("throws a ValidationError carrying fieldErrors", () => {
    const client = clientErrorOf(() => parseOrThrow(schema, { email: "nope", age: 200 }));
    expect(client.code).toBe(ERROR_CODES.VALIDATION);
    expect(client.fieldErrors?.email).toEqual(["Enter a valid email address."]);
    expect(client.fieldErrors?.age).toEqual(["Age must be at most 130."]);
  });

  it("flattens nested paths so a form can map messages back to inputs", () => {
    const nested = z.object({
      address: z.object({ city: z.string().min(1, "City is required.") }),
    });
    const client = clientErrorOf(() => parseOrThrow(nested, { address: { city: "" } }));

    expect(Object.keys(client.fieldErrors ?? {})).toEqual(["address.city"]);
    expect(client.fieldErrors?.["address.city"]).toEqual(["City is required."]);
  });

  it("keeps only the first message per field", () => {
    const strict = z.object({
      code: z
        .string()
        .min(3, "Too short.")
        .regex(/^[0-9]+$/, "Digits only."),
    });
    const client = clientErrorOf(() => parseOrThrow(strict, { code: "a" }));

    expect(client.fieldErrors?.code).toHaveLength(1);
  });

  it("reports a form-level failure under the subject when there is no path", () => {
    const scalar = z.string().min(1, "Required.");
    const client = clientErrorOf(() => parseOrThrow(scalar, "", "body"));

    expect(Object.keys(client.fieldErrors ?? {})).toEqual(["body"]);
    expect(client.fieldErrors?.body).toEqual(["Required."]);
  });
});

describe("safeParse", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("reports success without throwing", () => {
    expect(safeParse(schema, { name: "Alpha" })).toMatchObject({ success: true });
  });

  it("reports failure without throwing", () => {
    const result = safeParse(schema, { name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.toClientError().code).toBe(ERROR_CODES.VALIDATION);
  });
});

describe("optionalPositiveInt", () => {
  it("falls back when absent or blank", () => {
    expect(optionalPositiveInt(null, 1)).toBe(1);
    expect(optionalPositiveInt(undefined, 1)).toBe(1);
    expect(optionalPositiveInt("  ", 1)).toBe(1);
  });

  it("accepts a value in range", () => {
    expect(optionalPositiveInt("3", 1)).toBe(3);
  });

  it("rejects zero, negatives, fractions and overflow", () => {
    for (const bad of ["0", "-1", "2.5", "1001", "abc"]) {
      const client = clientErrorOf(() => optionalPositiveInt(bad, 1));
      expect(client.fieldErrors?.page, bad).toEqual(["Must be a whole number between 1 and 1000."]);
    }
  });
});

describe("field primitives", () => {
  it("normalizes email to lowercase and trims", () => {
    expect(emailAddress.parse("  Student@Example.COM ")).toBe("student@example.com");
    expect(() => emailAddress.parse("nope")).toThrow();
  });

  it("accepts common phone formats and rejects letters", () => {
    for (const good of ["+92 300 1234567", "0300-1234567", "(0300) 1234567"]) {
      expect(phoneNumber.parse(good), good).toBeTruthy();
    }
    expect(() => phoneNumber.parse("call me")).toThrow();
  });

  it("normalizes a local phone number to an international one", () => {
    expect(normalizePhone("0300-1234567")).toBe("+3001234567");
    expect(normalizePhone("+92 300 1234567")).toBe("+923001234567");
    expect(normalizePhone("3001234567")).toBe("3001234567");
  });

  it("validates an amount as text, since a number cannot hold every cent", () => {
    expect(decimalAmount.parse("1250.50")).toBe("1250.50");
    expect(decimalAmount.parse("0")).toBe("0");
    expect(() => decimalAmount.parse("10.005")).toThrow();
    expect(() => decimalAmount.parse("1e3")).toThrow();
    expect(() => decimalAmount.parse(1250.5 as unknown as string)).toThrow();
  });

  it("uppercases a currency code", () => {
    expect(currencyCode.parse(" pkr ")).toBe("PKR");
    expect(() => currencyCode.parse("PK")).toThrow();
  });

  it("restricts identifiers to a safe character set", () => {
    expect(identifier("Student number").parse("STU-2026-0001")).toBe("STU-2026-0001");
    expect(() => identifier("Student number").parse("<script>")).toThrow();
  });
});
