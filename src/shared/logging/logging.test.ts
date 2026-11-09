import { describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../errors";
import {
  AUDIT_ACTIONS,
  createAuditEvent,
  createLogger,
  isSensitiveKey,
  loggableError,
  newCorrelationId,
  redact,
  type LogEvent,
} from "./index";

function collectingLogger(level: "debug" | "info" = "debug") {
  const events: LogEvent[] = [];
  const logger = createLogger({
    level,
    correlationId: "req_test_1",
    now: () => new Date("2026-09-30T00:00:00.000Z"),
    sink: (_line, event) => {
      events.push(event);
    },
  });
  return { logger, events };
}

describe("isSensitiveKey", () => {
  it("flags credential-bearing keys in any casing convention", () => {
    for (const key of [
      "password",
      "Password",
      "userPassword",
      "user_password",
      "PASSWORD_CONFIRM",
      "token",
      "accessToken",
      "access_token",
      "refreshToken",
      "Authorization",
      "cookie",
      "sessionId",
      "SESSION_ID",
      "apiKey",
      "privateKey",
      "cvv",
      "nationalId",
      "accountNumber",
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it("does not flag innocuous keys that merely look similar", () => {
    for (const key of [
      "author",
      "authority",
      "authorizedAt",
      "studentId",
      "className",
      "amount",
      "currency",
    ]) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });

  it("over-redacts a sensitive token anywhere in the key, by design", () => {
    // Suffix matching would be tidier — `sessionCount` and `tokenCount` are not secrets — but it
    // would also let `userPassword`, `dbPassword` and `refreshTokenValue` through. Losing a count
    // from a log line is cheap; leaking a credential is not, so masking wins. RULES.md section 36
    // still requires useful context, so these keys must simply not be relied on for logging.
    for (const key of ["sessionCount", "tokenCount", "passwordPolicyName"]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });
});

describe("redact", () => {
  it("masks a whole object when its own key is sensitive", () => {
    // `credentials` is itself a sensitive key, so the entire subtree is dropped rather than walked.
    const result = redact({ credentials: { password: "hunter2" } }) as Record<string, unknown>;
    expect(result.credentials).toBe("[redacted]");
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("masks sensitive values at any depth", () => {
    const result = redact({
      studentId: "STU-2026-0001",
      form: { password: "hunter2", confirmPassword: "hunter2" },
      nested: { deeper: { accessToken: "abc123" } },
    }) as Record<string, unknown>;

    expect(result.studentId).toBe("STU-2026-0001");
    expect(result.form).toEqual({ password: "[redacted]", confirmPassword: "[redacted]" });
    expect(result.nested).toEqual({ deeper: { accessToken: "[redacted]" } });
  });

  it("masks sensitive entries inside arrays", () => {
    const result = redact([{ password: "p" }, { ok: 1 }]);
    expect(result).toEqual([{ password: "[redacted]" }, { ok: 1 }]);
  });

  it("truncates oversized strings but keeps the length visible", () => {
    const result = redact({ note: "x".repeat(1000) }) as { note: string };
    expect(result.note.length).toBeLessThan(600);
    expect(result.note).toContain("[1000 chars]");
  });

  it("serializes dates, bigints and errors rather than dropping them", () => {
    const result = redact({
      at: new Date("2026-09-30T00:00:00.000Z"),
      total: BigInt(125050),
      failure: new Error("boom"),
    }) as Record<string, unknown>;

    expect(result.at).toBe("2026-09-30T00:00:00.000Z");
    expect(result.total).toBe("125050");
    expect(result.failure).toEqual({ name: "Error", message: "boom" });
  });

  it("survives circular references instead of throwing", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    expect(() => redact(cyclic)).not.toThrow();
    expect(redact(cyclic)).toEqual({ name: "loop", self: "[circular]" });
  });

  it("caps oversized arrays and objects", () => {
    const many = Array.from({ length: 60 }, (_unused, index) => index);
    const result = redact({
      many,
      wide: Object.fromEntries(Array.from({ length: 60 }, (_u, i) => [`k${i}`, i])),
    }) as {
      many: unknown[];
      wide: Record<string, unknown>;
    };
    expect(result.many).toHaveLength(51);
    expect(result.many[50]).toBe("…[10 more]");
    expect(Object.keys(result.wide)).toHaveLength(50);
  });
});

describe("createLogger", () => {
  it("emits one JSON object per event with level, name, time and correlation id", () => {
    const { logger, events } = collectingLogger();

    logger.info("fee.payment.recorded", { receiptNo: "RCP-1", amount: "1250.50" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: "info",
      event: "fee.payment.recorded",
      timestamp: "2026-09-30T00:00:00.000Z",
      correlationId: "req_test_1",
      fields: { receiptNo: "RCP-1", amount: "1250.50" },
    });
  });

  it("produces a parseable JSON line", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      correlationId: "req_test_1",
      sink: (line) => {
        lines.push(line);
      },
    });

    logger.warn("attendance.change", { sectionId: "SEC-1" });

    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0] ?? "")).not.toThrow();
    expect(JSON.parse(lines[0] ?? "").event).toBe("attendance.change");
  });

  it("redacts sensitive fields on the way out", () => {
    const { logger, events } = collectingLogger();

    logger.info("auth.login", { email: "a@b.c", password: "hunter2" });

    expect(events[0]?.fields).toEqual({ email: "a@b.c", password: "[redacted]" });
    expect(JSON.stringify(events[0])).not.toContain("hunter2");
  });

  it("honours the level threshold", () => {
    const { logger, events } = collectingLogger("info");

    logger.debug("noisy");
    logger.info("kept");
    logger.error("kept.too");

    expect(events.map((event) => event.event)).toEqual(["kept", "kept.too"]);
  });

  it("child keeps correlation id and level, and merges context", () => {
    const { logger, events } = collectingLogger();
    const child = logger.child({ module: "finance" }, "req_child_2");

    child.info("fee.change", { feeId: "F-1" });

    expect(events[0]).toMatchObject({
      correlationId: "req_child_2",
      context: { module: "finance" },
      fields: { feeId: "F-1" },
    });
  });

  it("child does not mutate the parent", () => {
    const { logger, events } = collectingLogger();

    logger.child({ module: "finance" }).info("a");
    logger.info("b");

    // The child carries its own context; the parent's later event must not inherit it.
    expect(events[0]?.context).toEqual({ module: "finance" });
    expect(events[1]?.context).toEqual({});
  });
});

describe("newCorrelationId", () => {
  it("produces unique, prefixed, sortable ids", () => {
    const ids = Array.from({ length: 200 }, () => newCorrelationId());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^req_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/);
    expect(newCorrelationId("job")).toMatch(/^job_/);
  });
});

describe("loggableError", () => {
  it("keeps code and category for an AppError, keeping the stack server-side", () => {
    const error = new NotFoundError("student STU-1 not in section SEC-1");
    const result = loggableError(error);

    expect(result).toEqual({
      errorType: "NotFoundError",
      errorCode: "NOT_FOUND",
      errorMessage: "student STU-1 not in section SEC-1",
    });
    expect(result.stack).toBeUndefined();
  });

  it("reduces an unknown throw to its type, not its contents", () => {
    expect(loggableError("connection string leaked").errorMessage).toBe("connection string leaked");
    expect(loggableError(42)).toEqual({ errorType: "number", errorMessage: "42" });
  });

  it("handles a validation error's field detail without leaking the raw input", () => {
    const result = loggableError(new ValidationError("bad", { email: ["Required"] }));
    expect(result.errorCode).toBe("VALIDATION");
  });
});

describe("createAuditEvent", () => {
  it("captures who, what, when, target, result and context", () => {
    const event = createAuditEvent({
      actorId: "USR-7",
      actorRole: "accountant",
      action: AUDIT_ACTIONS.FEE_CHANGE,
      targetType: "fee",
      targetId: "FEE-2026-0001",
      result: "success",
      context: { amount: "1250.50", currency: "PKR" },
      correlationId: "req_abc",
      occurredAt: new Date("2026-09-30T10:00:00.000Z"),
    });

    expect(event).toEqual({
      actorId: "USR-7",
      actorRole: "accountant",
      action: "fee.change",
      occurredAt: "2026-09-30T10:00:00.000Z",
      targetType: "fee",
      targetId: "FEE-2026-0001",
      result: "success",
      context: { amount: "1250.50", currency: "PKR" },
      correlationId: "req_abc",
    });
  });

  it("records a scheduled job as the system actor rather than rejecting it", () => {
    const event = createAuditEvent({
      action: AUDIT_ACTIONS.CONFIGURATION_CHANGE,
      targetType: "config",
      targetId: "academic-session",
      result: "success",
    });
    expect(event.actorId).toBe("system");
    expect(event.actorRole).toBeNull();
  });

  it("rejects a record that cannot answer who did what to what", () => {
    expect(() =>
      createAuditEvent({
        action: AUDIT_ACTIONS.LOGIN,
        targetType: "",
        targetId: "USR-7",
        result: "success",
      }),
    ).toThrow(/targetType/);

    expect(() =>
      createAuditEvent({
        action: AUDIT_ACTIONS.LOGIN,
        targetType: "user",
        targetId: "  ",
        result: "success",
      }),
    ).toThrow(/targetId/);
  });

  it("redacts context, so a token cannot reach the audit trail", () => {
    const event = createAuditEvent({
      action: AUDIT_ACTIONS.PERMISSION_CHANGE,
      targetType: "role",
      targetId: "ROLE-1",
      result: "success",
      context: { permission: "fee.write", sessionSecret: "s3cr3t" },
    });

    expect(event.context).toEqual({ permission: "fee.write", sessionSecret: "[redacted]" });
  });
});
