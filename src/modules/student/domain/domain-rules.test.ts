/**
 * Student and guardian domain rules (`PHASES.md` Phase 7).
 *
 * The state machine is the part most likely to rot silently — a new lifecycle value or a relaxed
 * edge would let a graduated student go back to active and nobody would notice until a report
 * disagreed with history — so it is asserted from the diagram in `DOMAIN-MODEL.md` §3 rather than
 * from a mirror of the implementation.
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { slugify, uniqueSlug } from "@/shared/validation/slug";

import {
  assertDocumentDecision,
  assertLinkIsActive,
  assertLifecycleTransition,
  assertNotAlreadyLinked,
  assertPrimaryContactFree,
  assertSessionAcceptsPlacement,
  assertStudentExists,
  canTransition,
  isStudentLifecycle,
  isDocumentStatus,
  lifecycleTimestampPatch,
  LIFECYCLE_LABELS,
  LIFECYCLE_TRANSITIONS,
  STUDENT_LIFECYCLE_STATES,
} from "./domain-rules";

describe("student lifecycle state machine", () => {
  it("matches DOMAIN-MODEL §3: admitted → active → promoted → graduated", () => {
    expect(canTransition("admitted", "active")).toBe(true);
    expect(canTransition("active", "promoted")).toBe(true);
    expect(canTransition("promoted", "graduated")).toBe(true);
  });

  it("allows the three exits from active", () => {
    expect(canTransition("active", "transferred")).toBe(true);
    expect(canTransition("active", "withdrawn")).toBe(true);
    expect(canTransition("active", "inactive")).toBe(true);
  });

  it("makes graduated, transferred and withdrawn terminal", () => {
    expect(LIFECYCLE_TRANSITIONS.graduated).toHaveLength(0);
    expect(LIFECYCLE_TRANSITIONS.transferred).toHaveLength(0);
    expect(LIFECYCLE_TRANSITIONS.withdrawn).toHaveLength(0);
  });

  it("never lets a terminal state re-enter the diagram", () => {
    for (const from of ["graduated", "transferred", "withdrawn"] as const) {
      for (const to of STUDENT_LIFECYCLE_STATES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("permits only reactivation from inactive, never a skip to graduated", () => {
    expect(canTransition("inactive", "active")).toBe(true);
    expect(canTransition("inactive", "withdrawn")).toBe(true);
    expect(canTransition("inactive", "graduated")).toBe(false);
    expect(canTransition("inactive", "promoted")).toBe(false);
  });

  it("rejects an illegal transition with an actionable message", () => {
    expect(() => assertLifecycleTransition("graduated", "active", "Ayesha")).toThrow(
      BusinessRuleError,
    );
    try {
      assertLifecycleTransition("graduated", "active", "Ayesha");
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).userMessage).toContain("Ayesha is graduated");
      expect((error as BusinessRuleError).userMessage).toContain("cannot become active");
    }
  });

  it("rejects a transition to the current state as a stale no-op", () => {
    expect(() => assertLifecycleTransition("active", "active")).toThrow(ConflictError);
  });

  it("rejects a value that is not a lifecycle state at all", () => {
    expect(() => assertLifecycleTransition("active", "expelled")).toThrow(ConflictError);
    expect(isStudentLifecycle("admitted")).toBe(true);
    expect(isStudentLifecycle("APPLICANT")).toBe(false);
    expect(isStudentLifecycle(7)).toBe(false);
  });

  it("labels every state for the UI", () => {
    for (const state of STUDENT_LIFECYCLE_STATES) {
      expect(LIFECYCLE_LABELS[state]).toBeTruthy();
    }
  });
});

describe("lifecycle timestamps", () => {
  const none = { admittedAt: null, graduatedAt: null, withdrawnAt: null };
  const now = new Date("2026-10-07T12:00:00.000Z");

  it("stamps admittedAt the first time a student becomes active", () => {
    expect(lifecycleTimestampPatch("active", none, now)).toEqual({ admittedAt: now });
  });

  it("leaves an already-stamped admittedAt alone on a later activation", () => {
    const admitted = new Date("2025-04-01T00:00:00.000Z");
    expect(lifecycleTimestampPatch("active", { ...none, admittedAt: admitted }, now)).toEqual({});
  });

  it("stamps graduation and withdrawal once each", () => {
    expect(lifecycleTimestampPatch("graduated", none, now)).toEqual({ graduatedAt: now });
    expect(lifecycleTimestampPatch("withdrawn", none, now)).toEqual({ withdrawnAt: now });

    const stamped = new Date("2024-06-01T00:00:00.000Z");
    expect(lifecycleTimestampPatch("graduated", { ...none, graduatedAt: stamped }, now)).toEqual(
      {},
    );
  });

  it("stamps nothing for a transition with no timestamp", () => {
    expect(lifecycleTimestampPatch("inactive", none, now)).toEqual({});
  });
});

describe("session placement guards", () => {
  const open = { id: "s1", name: "2026–27", isCurrent: true, closedAt: null };

  it("accepts an open session, current or not", () => {
    expect(() => assertSessionAcceptsPlacement(open)).not.toThrow();
    expect(() => assertSessionAcceptsPlacement({ ...open, isCurrent: false })).not.toThrow();
  });

  it("refuses a closed session (RULES §44 read-only history)", () => {
    expect(() => assertSessionAcceptsPlacement({ ...open, closedAt: new Date() })).toThrow(
      BusinessRuleError,
    );
  });

  it("refuses a session that does not exist", () => {
    expect(() => assertSessionAcceptsPlacement(null)).toThrow(NotFoundError);
  });
});

describe("student existence", () => {
  it("throws NotFoundError for a missing student", () => {
    expect(() => assertStudentExists(null)).toThrow(NotFoundError);
  });

  it("passes an existing student through", () => {
    const student = { id: "st-1" };
    expect(() => assertStudentExists(student)).not.toThrow();
  });
});

describe("guardian link rules", () => {
  const link = {
    guardianUserId: "u1",
    studentId: "st-1",
    relationship: "mother",
    isActive: true,
  };

  it("refuses a second active primary contact", () => {
    expect(() => assertPrimaryContactFree(true, "primary")).toThrow(ConflictError);
    expect(() => assertPrimaryContactFree(false, "primary")).not.toThrow();
    expect(() => assertPrimaryContactFree(true, "secondary")).not.toThrow();
    expect(() => assertPrimaryContactFree(true, null)).not.toThrow();
  });

  it("refuses to unlink a link that is already inactive, and accepts an active one", () => {
    expect(() => assertLinkIsActive({ ...link, isActive: false })).toThrow(ConflictError);
    expect(() => assertLinkIsActive(link)).not.toThrow();
    expect(() => assertLinkIsActive(null)).toThrow(NotFoundError);
  });

  it("refuses to re-link a pair that is still linked", () => {
    expect(() => assertNotAlreadyLinked(link)).toThrow(ConflictError);
    expect(() => assertNotAlreadyLinked(null)).not.toThrow();
    expect(() => assertNotAlreadyLinked({ ...link, isActive: false })).not.toThrow();
  });
});

describe("document verification decisions", () => {
  it("only lets a pending document be decided", () => {
    expect(() => assertDocumentDecision("pending_verification", "verified", null)).not.toThrow();
    expect(() => assertDocumentDecision("verified", "verified", null)).toThrow(BusinessRuleError);
    expect(() => assertDocumentDecision("expired", "verified", null)).toThrow(BusinessRuleError);
    expect(() => assertDocumentDecision("rejected", "verified", null)).toThrow(BusinessRuleError);
  });

  it("requires a reason to reject", () => {
    expect(() => assertDocumentDecision("pending_verification", "rejected", null)).toThrow(
      ConflictError,
    );
    expect(() => assertDocumentDecision("pending_verification", "rejected", "  ")).toThrow(
      ConflictError,
    );
    expect(() =>
      assertDocumentDecision("pending_verification", "rejected", "Blurry scan."),
    ).not.toThrow();
  });

  it("knows the four stored statuses", () => {
    expect(isDocumentStatus("pending_verification")).toBe(true);
    expect(isDocumentStatus("archived")).toBe(false);
  });
});

describe("student slug (Phase 7 task 14)", () => {
  it("mints a readable slug from the student's name", () => {
    expect(slugify("Ayesha  Khan")).toBe("ayesha-khan");
  });

  it("stays unique within its scope (the institution's existing slugs)", () => {
    const existing = ["ayesha-khan", "ayesha-khan-2"];
    expect(uniqueSlug("Ayesha Khan", existing)).toBe("ayesha-khan-3");
  });

  it("falls back safely for a name with no usable characters", () => {
    expect(slugify("***")).toBe("item");
    expect(uniqueSlug("***", ["item"])).toBe("item-2");
  });
});
