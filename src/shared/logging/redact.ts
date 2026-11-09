/**
 * Redaction for structured logs, per `RULES.md` sections 34 and 36.
 *
 * The rule is "never log passwords, access tokens, session secrets" and "no complete sensitive
 * personal records unnecessarily". A denylist is the wrong shape for that: a new field name nobody
 * remembered to add would be logged verbatim. So redaction here is *structural* — it walks the value
 * and masks any key that looks sensitive, and it truncates anything oversized.
 *
 * It is still a denylist underneath, so it is defence in depth rather than a guarantee. Secrets must
 * not be passed to the logger in the first place.
 */

/**
 * Key tokens that mark a value as sensitive.
 *
 * Matched per token, not as substrings: `authorization` and `sessionId` are caught, while `author`
 * and `authority` are not. A whole-key check catches compounds like `PASSWORD_CONFIRM`.
 */
const SENSITIVE_TOKENS = new Set([
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "token",
  "secret",
  "authorization",
  "auth",
  "cookie",
  "session",
  "credential",
  "credentials",
  "apikey",
  "privatekey",
  "salt",
  "signature",
  "otp",
  "pin",
  "cvv",
  "cvc",
  "cardnumber",
  "ssn",
  "nationalid",
  "nic",
  "accountnumber",
  "iban",
]);

export const REDACTED = "[redacted]";

/** Above this, a string is truncated in the log (the full value is still returned by the caller). */
const MAX_STRING_LENGTH = 512;

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;

/** `sessionId`, `session_id`, `SESSION-ID` and `sessionID` all tokenize to `session`, `id`. */
function tokenizeKey(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

export function isSensitiveKey(key: string): boolean {
  const tokens = tokenizeKey(key);
  if (tokens.length === 0) return false;
  // Whole key, to catch compounds that do not split into known tokens.
  if (SENSITIVE_TOKENS.has(tokens.join(""))) return true;
  return tokens.some((token) => SENSITIVE_TOKENS.has(token));
}

function truncate(text: string): string {
  return text.length <= MAX_STRING_LENGTH
    ? text
    : `${text.slice(0, MAX_STRING_LENGTH)}…[${text.length} chars]`;
}

function redactCollection(
  value: unknown[] | Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`…[${value.length - MAX_ARRAY_ITEMS} more]`);
    }
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(entry, depth + 1, seen);
  }
  return result;
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case "string":
      return truncate(value);
    case "number":
    case "boolean":
    case "bigint":
      return typeof value === "bigint" ? value.toString() : value;
    case "function":
      return "[function]";
    case "symbol":
      return value.toString();
    default:
      break;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: truncate(value.message) };
  }
  if (depth >= MAX_DEPTH) return "[max depth]";

  return redactCollection(value as unknown[] | Record<string, unknown>, depth, seen);
}

/** Return a log-safe copy of `value`: sensitive keys masked, oversized values truncated. */
export function redact(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet<object>());
}
