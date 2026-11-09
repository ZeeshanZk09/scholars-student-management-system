import { describe, expect, it } from "vitest";

import { ERROR_CODES, ForbiddenError, toClientError } from "@/shared/errors";
import {
  hasPermission,
  requirePermission,
  type PermissionKey,
  type Principal,
} from "@/shared/authorization";

import {
  authorizeInstitutionCommand,
  resolveActingInstitutionId,
  resolvePrincipal,
} from "./authorization-service";
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

describe("resolveActingInstitutionId (Phase 6 task 1 — institute context)", () => {
  const withAffiliations = (ids: readonly string[]) =>
    createAuthorizationFake(new Map(), {
      institutionsByUser: new Map([["user-1", ids]]),
    });

  it("is null for a user with no affiliations — a platform-level user, not a failure", async () => {
    expect(
      await resolveActingInstitutionId(createAuthorizationFake(), { userId: "user-1" }),
    ).toBeNull();
  });

  it("is that institution when exactly one affiliation disambiguates", async () => {
    expect(
      await resolveActingInstitutionId(withAffiliations(["inst-a"]), { userId: "user-1" }),
    ).toBe("inst-a");
  });

  it("falls back to platform rather than guessing between several affiliations", async () => {
    // Picking one arbitrarily would show a user *some other tenant's* numbers while they believed
    // they were looking at their own; withholding every institution-scoped grant is the honest
    // failure until an institution switcher exists.
    expect(
      await resolveActingInstitutionId(withAffiliations(["inst-a", "inst-b"]), {
        userId: "user-1",
      }),
    ).toBeNull();
  });

  it("resolves an unknown user to platform context rather than throwing", async () => {
    expect(
      await resolveActingInstitutionId(createAuthorizationFake(), { userId: "nobody" }),
    ).toBeNull();
  });
});

describe("authorizeInstitutionCommand — the institution-targeted boundary", () => {
  const affiliated = (ids: readonly string[]) =>
    createAuthorizationFake(new Map(), {
      institutionsByUser: new Map([["user-1", ids]]),
    });

  it("authorises an affiliated user who holds the capability at that institution", async () => {
    const instA: GrantScope = { kind: "institution", institutionId: "inst-a" };
    const fake = createAuthorizationFake(
      new Map([["user-1", { roleGrants: [role("students.create", instA)], directGrants: [] }]]),
      { institutionsByUser: new Map([["user-1", ["inst-a"]]]) },
    );

    const principal = await authorizeInstitutionCommand(fake, {
      userId: "user-1",
      institutionId: "inst-a",
      permission: "students.create",
    });

    expect(principal.institutionId).toBe("inst-a");
    expect(principal.permissions.has("students.create")).toBe(true);
  });

  it("refuses an institution the user does not belong to, even with a platform grant", async () => {
    // SECURITY.md §87's `institutionId = "another-institution"`: the capability check runs *at*
    // the target, so a platform grant of the key would otherwise authorise a write into any
    // tenant. The affiliation is what stops it, and it stops it regardless of grants.
    const fake = createAuthorizationFake(
      new Map([["user-1", { roleGrants: [role("students.create")], directGrants: [] }]]),
      { institutionsByUser: new Map([["user-1", ["inst-a"]]]) },
    );

    await expect(
      authorizeInstitutionCommand(fake, {
        userId: "user-1",
        institutionId: "inst-b",
        permission: "students.create",
      }),
    ).rejects.toMatchObject({ message: "Outside your institution" });
  });

  it("lets a platform-level user (no affiliations) act in any institution", async () => {
    const fake = createAuthorizationFake(
      new Map([["user-1", { roleGrants: [role("academic.manage")], directGrants: [] }]]),
    );

    const principal = await authorizeInstitutionCommand(fake, {
      userId: "user-1",
      institutionId: "inst-b",
      permission: "academic.manage",
    });
    expect(principal.institutionId).toBe("inst-b");
  });

  it("resolves the capability at the target, so an institution grant held elsewhere does not leak", async () => {
    const instA: GrantScope = { kind: "institution", institutionId: "inst-a" };
    const fake = createAuthorizationFake(
      new Map([["user-1", { roleGrants: [role("students.create", instA)], directGrants: [] }]]),
      { institutionsByUser: new Map([["user-1", ["inst-a", "inst-b"]]]) },
    );

    const inside = await authorizeInstitutionCommand(fake, {
      userId: "user-1",
      institutionId: "inst-a",
      permission: "students.create",
    });
    expect(inside.permissions.has("students.create")).toBe(true);

    // Affiliated with inst-b too, so the affiliation bound passes — but the grant is scoped to
    // inst-a and therefore invisible while acting in inst-b. Scope is applied before precedence,
    // exactly as ADR-0001 requires.
    await expect(
      authorizeInstitutionCommand(fake, {
        userId: "user-1",
        institutionId: "inst-b",
        permission: "students.create",
      }),
    ).rejects.toThrow("Missing permission");
  });

  it("refuses a capability the user simply does not hold", async () => {
    const fake = affiliated(["inst-a"]);
    await expect(
      authorizeInstitutionCommand(fake, {
        userId: "user-1",
        institutionId: "inst-a",
        permission: "fees.refund",
      }),
    ).rejects.toThrow("Missing permission");
  });

  it("uses the same refusal text as requireInstitutionScope, so the client cannot tell them apart", async () => {
    const fake = affiliated(["inst-a"]);
    try {
      await authorizeInstitutionCommand(fake, {
        userId: "user-1",
        institutionId: "inst-b",
        permission: "students.create",
      });
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect(toClientError(error).code).toBe(ERROR_CODES.FORBIDDEN);
      expect((error as { userMessage: string }).userMessage).toBe(
        new ForbiddenError("Outside your institution").userMessage,
      );
    }
  });
});
