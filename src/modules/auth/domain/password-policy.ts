/**
 * Password policy — pure rules, no framework, no database (`src/modules/README.md` layer 1).
 *
 * `SECURITY.md` §7 asks for length-first policy rather than arbitrary complexity theatre:
 * "prioritize password length and resistance to credential stuffing over arbitrary complexity
 * requirements". So the rules here are: long enough, not one of the passwords attackers try
 * first, and not the user's own email wearing a disguise.
 *
 * The common-password list is deliberately small and embedded. It exists to stop the passwords
 * that appear in every credential-stuffing dictionary, not to replace a breach-corpus check
 * (HaveIBeenPwned k-anonymity would be the upgrade path, and it needs network access this
 * domain layer must not have).
 */

/** Minimum length. Twelve is the floor `SECURITY.md` §7's length-first stance supports today. */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Maximum length. Argon2id cost is independent of input length, but an unbounded password is
 * still an unbounded allocation on the way to the hash — a boundary needs a size limit
 * (`RULES.md` §52).
 */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * The passwords every stuffing run tries first, lower-cased. Checked after lower-casing the
 * input, so `Password123` is caught by its `password123` stem only if that stem is listed —
 * which is why the list favours long, policy-shaped entries rather than `123456` (already
 * rejected by length) alone.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passwordpassword",
  "passw0rd",
  "p@ssword",
  "p@ssw0rd",
  "p@ssword123",
  "qwertyuiop",
  "qwerty123456",
  "letmein123",
  "letmeinletmein",
  "iloveyou123",
  "welcome123",
  "welcome1234",
  "admin123456",
  "administrator",
  "changeme123",
  "trustno1trustno1",
  "superman123",
  "starwars123",
  "football123",
  "baseball123",
  "basketball12",
  "princess123",
  "dragon123456",
  "monkey123456",
  "mustang12345",
  "shadow123456",
  "master123456",
  "michael12345",
  "jennifer123",
  "jordan123456",
  "harley123456",
  "ranger123456",
  "buster123456",
  "hunter123456",
  "charlie12345",
  "thomas123456",
  "robert123456",
  "daniel123456",
  "computer1234",
  "internet1234",
  "samsung12345",
  "google123456",
  "facebook1234",
  "whatever1234",
  "nothing12345",
  "freedom12345",
  "service12345",
  "summer2024!!",
  "summer2025!!",
  "winter2024!!",
  "winter2025!!",
  "school123456",
  "student12345",
  "teacher12345",
  "scholars1234",
  "education123",
  "learning1234",
  "children1234",
  "family123456",
  "sunshine1234",
  "chocolate123",
  "starwars1234",
  "pokemon12345",
  "mickey123456",
  "jessica12345",
  "abcdefghijk",
  "abcdefghijkl",
  "aaaaaaaaaaaa",
  "aaaaaaaaaaaaaa",
  "111111111111",
  "123456789012",
  "123451234512",
  "qazwsxedcrfv",
  "qweasdqweasd",
  "zaq12wsx3edc",
  "1qaz2wsx3edc",
  "1q2w3e4r5t6y",
  "asdfghjkl;./",
  "zxcvbnmmnbvc",
  "woaini1314520",
  "wangyifan123",
  "zhangwei1234",
  "liwei1234567",
  "a1234567890",
  "aa123456789",
  "abc123456789",
  "abcd12345678",
  "q1w2e3r4t5y6",
  "zaq1zaq1zaq1",
  "123qweasd456",
  "password@123",
  "password#123",
  "password!234",
  "welcome@1234",
  "admin@123456",
  "root12345678",
  "system123456",
  "database1234",
  "secret123456",
  "temporary123",
  "changeme1234",
  "default12345",
  "guest1234567",
  "test12345678",
  "testing12345",
  "demo12345678",
  "sample123456",
  "example12345",
  "custom123456",
  "company12345",
  "business1234",
  "project12345",
  "customer1234",
  "client123456",
  "account12345",
  "login1234567",
  "signin123456",
  "member123456",
  "user12345678",
  "users1234567",
  "profile12345",
  "private12345",
  "secure123456",
  "security1234",
  "protect12345",
  "strong123456",
  "complex12345",
  "random123456",
  "unique123456",
  "correcthorsebatterystaple",
]);

/** Why a password was rejected. Each code maps to one field error at the boundary. */
export type PasswordIssueCode =
  "too_short" | "too_long" | "common" | "contains_email" | "contains_name";

export interface PasswordIssue {
  readonly code: PasswordIssueCode;
  readonly message: string;
}

export type PasswordCheck =
  | { readonly ok: true; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly PasswordIssue[] };

export interface PasswordContext {
  /** The account's email, if known — its local part must not appear in the password. */
  readonly email?: string | undefined;
  /** The account's display name, if known — ditto. */
  readonly name?: string | undefined;
}

function issue(code: PasswordIssueCode, message: string): PasswordIssue {
  return { code, message };
}

/**
 * Check a candidate password against the policy.
 *
 * @param password - The raw candidate, as typed. Never logged, never thrown in an error message.
 * @param context - Account identifiers whose fragments would make the password guessable.
 */
export function checkPassword(password: string, context: PasswordContext = {}): PasswordCheck {
  const issues: PasswordIssue[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(issue("too_short", `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`));
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(issue("too_long", `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`));
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) {
    issues.push(issue("common", "This password appears on public lists of common passwords."));
  }

  const email = context.email?.trim().toLowerCase();
  if (email !== undefined && email !== "") {
    const [localPart] = email.split("@");
    if (localPart !== undefined && localPart.length >= 4 && lower.includes(localPart)) {
      issues.push(issue("contains_email", "Password must not contain your email address."));
    }
  }

  const name = context.name?.trim().toLowerCase();
  if (name !== undefined && name !== "") {
    // Match on words rather than the whole string so "Montgomery Burns" catches
    // "montgomery-burns-99" (hyphens, no space) as well as "montgomeryburns".
    const words = name.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4);
    if (words.some((word) => lower.includes(word))) {
      issues.push(issue("contains_name", "Password must not contain your name."));
    }
  }

  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}
