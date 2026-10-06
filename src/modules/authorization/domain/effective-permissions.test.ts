import { describe, expect, it } from "vitest";

import type { PermissionKey } from "@/shared/authorization";

import type { DirectGrant, GrantScope, RoleGrant } from "./effective-permissions";
import {
  grantAppliesIn,
  resolveEffectivePermissions,
  type EffectivePermissionsInput,
} from "./effective-permissions";

const platform: GrantScope = { kind: "platform" };
const at = (institutionId: string): GrantScope => ({ kind: "institution", institutionId });

const role = (key: PermissionKey, scope: GrantScope): RoleGrant => ({ key, scope });
const grant = (key: PermissionKey, scope: GrantScope): DirectGrant => ({
  key,
  effect: "grant",
  scope,
});
const deny = (key: PermissionKey, scope: GrantScope): DirectGrant => ({
  key,
  effect: "deny",
  scope,
});

function effective(input: Partial<EffectivePermissionsInput>): ReadonlySet<PermissionKey> {
  return resolveEffectivePermissions({
    roleGrants: [],
    directGrants: [],
    actingInstitutionId: null,
    ...input,
  });
}

const all = (keys: readonly PermissionKey[]): ReadonlySet<PermissionKey> => new Set(keys);

describe("grantAppliesIn", () => {
  it("lets a platform grant apply in every context, including a null one", () => {
    expect(grantAppliesIn(platform, null)).toBe(true);
    expect(grantAppliesIn(platform, "inst-a")).toBe(true);
    expect(grantAppliesIn(platform, "inst-b")).toBe(true);
  });

  it("constrains an institution grant to its own institution", () => {
    expect(grantAppliesIn(at("inst-a"), "inst-a")).toBe(true);
    expect(grantAppliesIn(at("inst-a"), "inst-b")).toBe(false);
  });

  it("never lets an institution grant apply to a platform-level actor", () => {
    expect(grantAppliesIn(at("inst-a"), null)).toBe(false);
  });
});

describe("role combinations (task 12)", () => {
  it("merges the capabilities of two roles", () => {
    // Admin + Teacher, per PRD §6: an account may hold several roles.
    const admin = [role("students.update", platform), role("fees.record", platform)];
    const teacher = [role("attendance.mark", platform), role("results.enter", platform)];

    expect(effective({ roleGrants: [...admin, ...teacher] })).toEqual(
      all(["students.update", "fees.record", "attendance.mark", "results.enter"]),
    );
  });

  it("deduplicates a key granted by more than one role", () => {
    const set = effective({
      roleGrants: [role("students.view", platform), role("students.view", platform)],
    });
    expect(set).toEqual(all(["students.view"]));
    expect(set).toHaveLength(1);
  });

  it("combines a platform role with an institution role while acting there", () => {
    const set = effective({
      roleGrants: [role("reports.view", platform), role("attendance.mark", at("inst-a"))],
      actingInstitutionId: "inst-a",
    });
    expect(set).toEqual(all(["reports.view", "attendance.mark"]));
  });

  it("keeps an institution role quarantined to its own institution", () => {
    const set = effective({
      roleGrants: [role("reports.view", platform), role("attendance.mark", at("inst-a"))],
      actingInstitutionId: "inst-b",
    });
    expect(set).toEqual(all(["reports.view"]));
  });

  it("shows only platform grants to a platform-level actor", () => {
    const set = effective({
      roleGrants: [role("roles.manage", platform), role("attendance.mark", at("inst-a"))],
      actingInstitutionId: null,
    });
    expect(set).toEqual(all(["roles.manage"]));
  });
});

describe("direct permission overrides (task 13)", () => {
  it("adds a capability no role carries", () => {
    const set = effective({
      roleGrants: [role("students.view", platform)],
      directGrants: [grant("fees.refund", platform)],
    });
    expect(set).toEqual(all(["students.view", "fees.refund"]));
  });

  it("lets a direct grant add exactly one key, not its neighbours", () => {
    const set = effective({
      roleGrants: [],
      directGrants: [grant("results.publish", platform)],
    });
    expect(set).toEqual(all(["results.publish"]));
  });

  it("lets a direct deny subtract a capability a role grants", () => {
    const set = effective({
      roleGrants: [role("attendance.update", platform), role("students.view", platform)],
      directGrants: [deny("attendance.update", platform)],
    });
    expect(set).toEqual(all(["students.view"]));
  });

  it("lets a direct deny beat a direct grant", () => {
    const set = effective({
      roleGrants: [],
      directGrants: [grant("fees.refund", platform), deny("fees.refund", platform)],
    });
    expect(set).toEqual(all([]));
  });

  it("scopes a deny to its institution: elsewhere the grant still applies", () => {
    const set = effective({
      roleGrants: [role("attendance.mark", platform)],
      directGrants: [deny("attendance.mark", at("inst-a"))],
      actingInstitutionId: "inst-a",
    });
    expect(set).toEqual(all([]));

    const elsewhere = effective({
      roleGrants: [role("attendance.mark", platform)],
      directGrants: [deny("attendance.mark", at("inst-a"))],
      actingInstitutionId: "inst-b",
    });
    expect(elsewhere).toEqual(all(["attendance.mark"]));
  });

  it("adds an institution direct grant only inside that institution", () => {
    const inside = effective({
      directGrants: [grant("results.publish", at("inst-a"))],
      actingInstitutionId: "inst-a",
    });
    const outside = effective({
      directGrants: [grant("results.publish", at("inst-a"))],
      actingInstitutionId: "inst-b",
    });
    expect(inside).toEqual(all(["results.publish"]));
    expect(outside).toEqual(all([]));
  });
});

describe("denied actions", () => {
  it("has nothing when there are no grants at all", () => {
    expect(effective({}).size).toBe(0);
  });

  it("removes a key even when it arrives through both a role and a direct grant", () => {
    const set = effective({
      roleGrants: [role("fees.record", platform)],
      directGrants: [grant("fees.record", platform), deny("fees.record", platform)],
    });
    expect(set.size).toBe(0);
  });
});
