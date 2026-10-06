import { describe, expect, it } from "vitest";

import { ERROR_CODES, toClientError } from "@/shared/errors";
import {
  hasPermission,
  requirePermission,
  type PermissionKey,
  type Principal,
} from "@/shared/authorization";

import { resolvePrincipal } from "./authorization-service";
import { createAuthorizationFake } from "./testing/fakes";
import type { GrantScope, RoleGrant } from "../domain/effective-permissions";

const platform: GrantScope = { kind: "platform" };
const role = (key: PermissionKey, scope: GrantScope = platform): RoleGrant => ({ key, scope });

function forbidden(thunk: () => void): void {
  try {
    thunk();
  } catch (error) {
    expect(toClientError(error).code).toBe(ERROR_CODES.FORBIDDEN);
    return;
  }
  throw new Error("expected the call to be forbidden");
}

describe("resolvePrincipal", () => {
  it("builds a principal from the store's role and direct grants", async () => {
    const fake = createAuthorizationFake(
      new Map([
        [
          "user-1",
          {
            roleGrants: [role("students.view"), role("attendance.mark")],
            directGrants: [{ key: "fees.refund", effect: "grant", scope: platform }],
          },
        ],
      ]),
    );

    const principal = await resolvePrincipal(fake, { userId: "user-1", institutionId: null });

    expect(principal.permissions).toEqual(
      new Set<PermissionKey>(["students.view", "attendance.mark", "fees.refund"]),
    );
    expect(principal.institutionId).toBeNull();
  });

  it("carries the acting institution into the principal", async () => {
    const fake = createAuthorizationFake(
      new Map([["user-1", { roleGrants: [role("attendance.mark")], directGrants: [] }]]),
    );
    const principal = await resolvePrincipal(fake, { userId: "user-1", institutionId: "inst-a" });
    expect(principal.institutionId).toBe("inst-a");
  });

  it("resolves institution grants only for the acting institution", async () => {
    const instA: GrantScope = { kind: "institution", institutionId: "inst-a" };
    const fake = createAuthorizationFake(
      new Map([["user-1", { roleGrants: [role("results.enter", instA)], directGrants: [] }]]),
    );

    const inside = await resolvePrincipal(fake, { userId: "user-1", institutionId: "inst-a" });
    const outside = await resolvePrincipal(fake, { userId: "user-1", institutionId: "inst-b" });

    expect(inside.permissions.has("results.enter")).toBe(true);
    expect(outside.permissions.has("results.enter")).toBe(false);
  });

  it("gives an unknown user an empty permission set rather than an error", async () => {
    const principal = await resolvePrincipal(createAuthorizationFake(), {
      userId: "nobody",
      institutionId: null,
    });
    expect(principal.permissions.size).toBe(0);
  });
});

describe("denied actions through a principal (task 14)", () => {
  function principal(permissions: ReadonlySet<PermissionKey>): Principal {
    return { userId: "user-1", institutionId: "inst-a", permissions };
  }

  it("refuses an action whose permission is absent", () => {
    forbidden(() => requirePermission(principal(new Set()), "students.delete"));
  });

  it("refuses a principal whose only grants came from an out-of-scope institution", async () => {
    const instB: GrantScope = { kind: "institution", institutionId: "inst-b" };
    const fake = createAuthorizationFake(
      new Map([["user-1", { roleGrants: [role("fees.refund", instB)], directGrants: [] }]]),
    );
    const actingElsewhere = await resolvePrincipal(fake, {
      userId: "user-1",
      institutionId: "inst-a",
    });
    forbidden(() => requirePermission(actingElsewhere, "fees.refund"));
  });

  it("lets hasPermission filter a list without raising", () => {
    const user = principal(new Set<PermissionKey>(["attendance.mark"]));
    expect(hasPermission(user, "attendance.mark")).toBe(true);
    expect(hasPermission(user, "attendance.update")).toBe(false);
  });

  it("keeps the safe user message while logging the specific permission", () => {
    try {
      requirePermission(principal(new Set()), "fees.refund");
      expect.unreachable("expected a refusal");
    } catch (error) {
      const appError = error as { message: string; userMessage: string; details: unknown };
      expect(appError.message).toBe("Missing permission");
      expect(appError.details).toEqual({ permission: "fees.refund", userId: "user-1" });
      expect(appError.userMessage).toBe(
        "You do not have permission to perform this action. If you believe this is a mistake, contact an administrator.",
      );
    }
  });
});
