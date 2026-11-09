import { describe, expect, it } from "vitest";
import { ERROR_CODES, toClientError } from "../errors";
import {
  ALL_PERMISSION_KEYS,
  hasPermission,
  isPermissionKey,
  PERMISSION_KEYS,
  requireInstitutionScope,
  requirePermission,
  requireSelfScope,
  type PermissionKey,
  type Principal,
} from "./index";

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: "user-1",
    institutionId: "inst-a",
    permissions: new Set<PermissionKey>(),
    ...overrides,
  };
}

function forbidden(thunk: () => void): void {
  try {
    thunk();
  } catch (error) {
    expect(toClientError(error).code).toBe(ERROR_CODES.FORBIDDEN);
    return;
  }
  throw new Error("expected the call to be forbidden");
}

describe("PERMISSION_KEYS", () => {
  it("has no duplicates, so a seed insert cannot collide", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it("exposes the same set for seeding as for checking", () => {
    expect(ALL_PERMISSION_KEYS).toEqual(PERMISSION_KEYS);
  });

  it("uses the dotted, action-oriented shape RULES 19 specifies", () => {
    for (const key of PERMISSION_KEYS) {
      expect(key, key).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });

  it("contains no wildcard, which would reintroduce implicit scope", () => {
    for (const key of PERMISSION_KEYS) {
      expect(key, key).not.toContain("*");
    }
  });

  it("separates a fee refund from recording a payment", () => {
    // A refund moves money the school did not earn, so it must be grantable and auditable on its own.
    expect(PERMISSION_KEYS).toContain("fees.refund");
    expect(PERMISSION_KEYS).toContain("payments.record");
  });

  it("separates publishing results from entering them", () => {
    expect(PERMISSION_KEYS).toContain("results.enter");
    expect(PERMISSION_KEYS).toContain("results.publish");
  });

  it("separates approving an admission from recording one (SECURITY.md §14)", () => {
    // Filing paperwork and deciding it are different trusts: the key exists on its own so a
    // receptionist-level grant can file applications without being able to convert them.
    expect(PERMISSION_KEYS).toContain("admissions.approve");
  });

  it("separates the ledger from the till, and a reversal from a booking", () => {
    // Reading fees is not reading the institution's finances; booking a movement is not
    // correcting posted history (ARCHITECTURE.md §54 — a correction is a reversal).
    expect(PERMISSION_KEYS).toContain("finance.view");
    expect(PERMISSION_KEYS).toContain("finance.record");
    expect(PERMISSION_KEYS).toContain("finance.manage");
    expect(PERMISSION_KEYS).toContain("finance.adjust");
    expect(PERMISSION_KEYS).not.toContain("fees.ledger");
  });

  it("separates the money-adjacent HR acts from reading the staff directory", () => {
    // PRD MODULE 8 / PHASE 11: a floor in-charge may see who is on shift (`employees.view`)
    // without being able to hire, edit, or move someone's salary and status — salary structures,
    // assignments and resign/terminate transitions are their own grant with their own audit.
    expect(PERMISSION_KEYS).toContain("employees.view");
    expect(PERMISSION_KEYS).toContain("employees.create");
    expect(PERMISSION_KEYS).toContain("employees.update");
    expect(PERMISSION_KEYS).toContain("employees.manage");

    const holder = principal({ permissions: new Set<PermissionKey>(["employees.view"]) });
    forbidden(() => requirePermission(holder, "employees.update"));
    forbidden(() => requirePermission(holder, "employees.manage"));
  });

  it("recognises its own keys and rejects near-misses", () => {
    expect(isPermissionKey("attendance.mark")).toBe(true);

    // The exact drift ADR-0001 exists to prevent.
    for (const bad of [
      "attendance.mark_all",
      "attendance.",
      "ATTENDANCE.MARK",
      "attendance.mark ",
      "",
    ]) {
      expect(isPermissionKey(bad), bad).toBe(false);
    }
  });
});

describe("requirePermission", () => {
  it("passes when the principal holds the permission", () => {
    const user = principal({ permissions: new Set<PermissionKey>(["students.view"]) });
    expect(() => requirePermission(user, "students.view")).not.toThrow();
  });

  it("refuses when the permission is absent", () => {
    forbidden(() => requirePermission(principal(), "students.view"));
  });

  it("refuses a principal holding no permissions at all", () => {
    forbidden(() => requirePermission(principal(), "fees.refund"));
  });

  it("does not treat holding one permission as holding its neighbours", () => {
    const user = principal({ permissions: new Set<PermissionKey>(["students.view"]) });
    forbidden(() => requirePermission(user, "students.delete"));
  });
});

describe("hasPermission", () => {
  it("answers without throwing, for filtering a list", () => {
    const user = principal({ permissions: new Set<PermissionKey>(["attendance.mark"]) });
    expect(hasPermission(user, "attendance.mark")).toBe(true);
    expect(hasPermission(user, "attendance.update")).toBe(false);
  });
});

describe("requireInstitutionScope", () => {
  it("passes for a record in the principal's own institution", () => {
    expect(() => requireInstitutionScope(principal(), "inst-a")).not.toThrow();
  });

  it("refuses a record in another institution", () => {
    forbidden(() => requireInstitutionScope(principal(), "inst-b"));
  });

  it("lets a platform-level principal through, since it is not institution-scoped", () => {
    const platform = principal({ institutionId: null });
    expect(() => requireInstitutionScope(platform, "inst-b")).not.toThrow();
  });
});

describe("requireSelfScope", () => {
  it("passes for the principal's own record", () => {
    expect(() => requireSelfScope(principal(), "user-1")).not.toThrow();
  });

  it("refuses another user's record", () => {
    forbidden(() => requireSelfScope(principal(), "user-2"));
  });

  it("refuses even a principal holding every permission, since self-scope is not a capability", () => {
    const powerful = principal({ permissions: new Set<PermissionKey>(PERMISSION_KEYS) });
    forbidden(() => requireSelfScope(powerful, "user-2"));
  });
});

describe("step order", () => {
  it("checks capability before scope, so a missing permission is not masked by a scope failure", () => {
    // RULES 18 orders the gates. Reporting "wrong institution" to someone who was never permitted
    // the action would leak that the record exists.
    const user = principal({ permissions: new Set<PermissionKey>() });

    try {
      requirePermission(user, "students.update");
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect((error as Error).message).toBe("Missing permission");
    }
  });

  it("keeps the specific reason in the log while the user sees a generic message", () => {
    // A user told exactly which permission they lack learns the shape of the permission model, and
    // confirming a guess is a way to enumerate what an account can do.
    const user = principal({ permissions: new Set<PermissionKey>() });

    try {
      requirePermission(user, "fees.refund");
      expect.unreachable("expected a refusal");
    } catch (error) {
      const appError = error as { message: string; userMessage: string; details: unknown };
      expect(appError.message).toBe("Missing permission");
      expect(appError.details).toEqual({ permission: "fees.refund", userId: "user-1" });
      expect(appError.userMessage).not.toContain("refund");
      expect(appError.userMessage).toBe(
        "You do not have permission to perform this action. If you believe this is a mistake, contact an administrator.",
      );
    }
  });
});
