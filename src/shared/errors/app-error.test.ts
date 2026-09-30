import { describe, expect, it } from "vitest";
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ERROR_CODES,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  isAppError,
  toClientError,
} from "./app-error";

describe("error codes and statuses", () => {
  it("maps each category to a distinct code and HTTP status", () => {
    const cases: ReadonlyArray<readonly [AppError, string, number]> = [
      [new ValidationError("bad input", {}), ERROR_CODES.VALIDATION, 400],
      [new UnauthorizedError(), ERROR_CODES.UNAUTHORIZED, 401],
      [new ForbiddenError(), ERROR_CODES.FORBIDDEN, 403],
      [new NotFoundError(), ERROR_CODES.NOT_FOUND, 404],
      [new ConflictError(), ERROR_CODES.CONFLICT, 409],
      [
        new BusinessRuleError("invalid transition", { userMessage: "Cannot promote a withdrawn student." }),
        ERROR_CODES.BUSINESS_RULE,
        422,
      ],
      [new InternalError(), ERROR_CODES.INTERNAL, 500],
    ];

    const codes = new Set<string>();

    for (const [error, code, status] of cases) {
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      codes.add(error.code);
    }

    expect(codes.size).toBe(cases.length);
  });
});

describe("user-facing messages", () => {
  it("gives every error a message that explains what happened", () => {
    const errors: AppError[] = [
      new ValidationError("bad input", {}),
      new UnauthorizedError(),
      new ForbiddenError(),
      new NotFoundError(),
      new ConflictError(),
      new BusinessRuleError("invalid transition", { userMessage: "Cannot promote a withdrawn student." }),
      new InternalError(),
    ];

    for (const error of errors) {
      expect(error.userMessage.length).toBeGreaterThan(0);
    }
  });

  it("prefers an explicit message over the default", () => {
    const error = new NotFoundError("no such student", {
      userMessage: "That student record no longer exists.",
    });

    expect(error.toClientError().message).toBe("That student record no longer exists.");
  });
});

describe("validation errors", () => {
  it("carries field errors through to the client projection", () => {
    const error = new ValidationError("firstName is required", {
      firstName: ["First name is required."],
      email: ["Enter a valid email address."],
    });

    expect(error.toClientError()).toEqual({
      code: ERROR_CODES.VALIDATION,
      message: error.userMessage,
      fieldErrors: {
        firstName: ["First name is required."],
        email: ["Enter a valid email address."],
      },
    });
  });

  it("does not include field errors on other categories", () => {
    expect(new NotFoundError().toClientError()).not.toHaveProperty("fieldErrors");
  });
});

describe("toClientError", () => {
  it("never leaks stack, cause or internal details", () => {
    const error = new InternalError("connection to postgres://user:hunter2@db failed", {
      cause: new Error("ECONNREFUSED"),
      details: { connectionString: "postgres://user:hunter2@db" },
    });

    const client = error.toClientError();
    const serialized = JSON.stringify(client);

    expect(client).toEqual({ code: ERROR_CODES.INTERNAL, message: error.userMessage });
    expect(Object.keys(client).sort()).toEqual(["code", "message"]);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("ECONNREFUSED");
    expect(serialized).not.toContain("stack");
  });

  it("keeps server-side detail available for logging", () => {
    const error = new ConflictError("duplicate admission number", {
      details: { admissionNumber: "ADM-0001" },
    });

    expect(error.details).toEqual({ admissionNumber: "ADM-0001" });
  });

  it("hides an unknown throw behind a generic internal error", () => {
    const thrown = new Error("relation \"Student\" does not exist");
    const client = toClientError(thrown);

    expect(client.code).toBe(ERROR_CODES.INTERNAL);
    expect(JSON.stringify(client)).not.toContain("Student");
  });

  it("passes an AppError through unchanged", () => {
    const error = new ForbiddenError();

    expect(toClientError(error)).toEqual(error.toClientError());
  });

  it("handles non-Error throws without leaking them", () => {
    for (const thrown of [undefined, null, "password=hunter2", 42, { secret: "hunter2" }]) {
      const client = toClientError(thrown);

      expect(client.code).toBe(ERROR_CODES.INTERNAL);
      expect(JSON.stringify(client)).not.toContain("hunter2");
    }
  });
});

describe("isAppError", () => {
  it("recognises every category", () => {
    expect(isAppError(new ValidationError("x", {}))).toBe(true);
    expect(isAppError(new InternalError())).toBe(true);
  });

  it("rejects look-alikes and non-errors", () => {
    class Impostor extends Error {}

    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError(new Impostor("looks similar"))).toBe(false);
    expect(isAppError({ code: ERROR_CODES.INTERNAL, status: 500 })).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("error identity", () => {
  it("keeps instanceof working after construction", () => {
    // Guards the ES2017 prototype-chain concern in AppError.
    expect(new NotFoundError()).toBeInstanceOf(NotFoundError);
    expect(new NotFoundError()).toBeInstanceOf(AppError);
    expect(new NotFoundError()).toBeInstanceOf(Error);
  });

  it("records the cause for server-side logging", () => {
    const cause = new Error("ECONNREFUSED");

    expect(new InternalError("db down", { cause }).cause).toBe(cause);
  });

  it("defaults details to an empty object", () => {
    expect(new NotFoundError().details).toEqual({});
  });
});
