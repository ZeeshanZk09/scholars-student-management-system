import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, checkPassword, type PasswordIssueCode } from "./password-policy";

function codes(
  password: string,
  context?: Parameters<typeof checkPassword>[1],
): PasswordIssueCode[] {
  return checkPassword(password, context).issues.map((issue) => issue.code);
}

describe("checkPassword", () => {
  it("accepts a long passphrase that is not on any list", () => {
    expect(checkPassword("purple-monorail-tuesday-42").ok).toBe(true);
  });

  it("rejects anything shorter than the minimum", () => {
    expect(codes("short")).toContain("too_short");
    expect(codes("a".repeat(PASSWORD_MIN_LENGTH - 1))).toContain("too_short");
    expect(codes("a".repeat(PASSWORD_MIN_LENGTH))).not.toContain("too_short");
  });

  it("rejects anything longer than the maximum", () => {
    expect(codes("x".repeat(129))).toContain("too_long");
    expect(codes("x".repeat(128))).not.toContain("too_long");
  });

  it("rejects embedded common passwords case-insensitively", () => {
    expect(codes("passwordpassword")).toContain("common");
    expect(codes("PasswordPassword")).toContain("common");
    expect(codes("correcthorsebatterystaple")).toContain("common");
  });

  it("rejects a password containing the email local part", () => {
    expect(codes("ali.raza-university-2026", { email: "ali.raza@school.edu" })).toContain(
      "contains_email",
    );
    // Local parts shorter than 4 characters are too short to be meaningful markers.
    expect(codes("ab-university-2026", { email: "ab@school.edu" })).not.toContain("contains_email");
    expect(codes("completely-different-phrase", { email: "ali.raza@school.edu" })).not.toContain(
      "contains_email",
    );
  });

  it("rejects a password containing the display name", () => {
    expect(codes("montgomery-burns-99", { name: "Montgomery Burns" })).toContain("contains_name");
    expect(codes("completely-different-phrase", { name: "Montgomery Burns" })).not.toContain(
      "contains_name",
    );
  });

  it("collects every failure at once so the user fixes them in one pass", () => {
    const result = checkPassword("password", { email: "password@x.co" });
    expect(result.ok).toBe(false);
    const codesSeen = result.issues.map((issue) => issue.code);
    expect(codesSeen).toContain("too_short");
    expect(codesSeen).toContain("common");
  });

  it("never echoes the password in any issue message", () => {
    const secret = "correcthorsebatterystaple";
    const result = checkPassword(secret, { email: "correct@x.co" });
    expect(result.ok).toBe(false);
    for (const issue of result.issues) {
      expect(issue.message).not.toContain(secret);
    }
  });
});
