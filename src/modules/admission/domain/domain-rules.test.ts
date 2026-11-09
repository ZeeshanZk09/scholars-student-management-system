/**
 * Admission domain rules (`PHASES.md` Phase 8, tasks 8–10).
 *
 * The state machine is asserted from the `admission_status` enum and `DOMAIN-MODEL.md` D-3/BR-3
 * rather than from a mirror of the implementation: a relaxed edge or a re-convertible status
 * would let one application produce two students, and nothing but a test would notice.
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError } from "@/shared/errors";

import {
  ADMISSION_STATUSES,
  ADMISSION_STATUS_LABELS,
  ADMISSION_TRANSITIONS,
  admissionTimestampPatch,
  assertAdmissionDocumentDecision,
  assertAdmissionEditable,
  assertAdmissionTransition,
  assertConvertable,
  assertDecisionReason,
  canTransition,
  isAdmissionStatus,
  isLikelyDuplicate,
  mintApplicationNumber,
} from "./domain-rules";

describe("admission status machine", () => {
  it("covers every status with a label and a transition row", () => {
    for (const status of ADMISSION_STATUSES) {
      expect(ADMISSION_STATUS_LABELS[status]).not.toBe("");
      expect(ADMISSION_TRANSITIONS[status]).toBeDefined();
    }
    expect(Object.keys(ADMISSION_TRANSITIONS).sort()).toEqual([...ADMISSION_STATUSES].sort());
  });

  it("knows the status values from the enum", () => {
    expect(isAdmissionStatus("under_review")).toBe(true);
    expect(isAdmissionStatus("applicant")).toBe(false);
    expect(isAdmissionStatus(7)).toBe(false);
  });

  it("allows the documented paths and refuses self-transitions", () => {
    expect(canTransition("submitted", "under_review")).toBe(true);
    expect(canTransition("waitlisted", "approved")).toBe(true);
    expect(canTransition("approved", "converted")).toBe(true);
    expect(canTransition("approved", "rejected")).toBe(true);
    for (const status of ADMISSION_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("keeps rejected, converted and cancelled terminal", () => {
    expect(ADMISSION_TRANSITIONS.rejected).toEqual([]);
    expect(ADMISSION_TRANSITIONS.converted).toEqual([]);
    expect(ADMISSION_TRANSITIONS.cancelled).toEqual([]);
  });

  it("refuses conversion from anything but approved", () => {
    expect(canTransition("submitted", "converted")).toBe(false);
    expect(canTransition("under_review", "converted")).toBe(false);
    expect(canTransition("waitlisted", "converted")).toBe(false);
    expect(canTransition("approved", "converted")).toBe(true);
  });

  it("asserts transitions with actionable messages", () => {
    expect(() => assertAdmissionTransition("submitted", "approved")).not.toThrow();
    expect(() => assertAdmissionTransition("rejected", "approved")).toThrow(BusinessRuleError);
    expect(() => assertAdmissionTransition("approved", "approved")).toThrow(ConflictError);
    expect(() => assertAdmissionTransition("submitted", "nope")).toThrow(ConflictError);
    try {
      assertAdmissionTransition("cancelled", "approved", "This application");
      expect.unreachable();
    } catch (error) {
      expect((error as BusinessRuleError).userMessage).toContain("This application is cancelled");
    }
  });
});

describe("decision rules", () => {
  it("requires a reason for rejection only", () => {
    expect(() => assertDecisionReason("rejected", "  ")).toThrow(ConflictError);
    expect(() => assertDecisionReason("rejected", null)).toThrow(ConflictError);
    expect(() => assertDecisionReason("rejected", "Failed the entrance test")).not.toThrow();
    expect(() => assertDecisionReason("approved", "")).not.toThrow();
    expect(() => assertDecisionReason("converted", null)).not.toThrow();
  });

  it("blocks conversion of already-converted or unapproved applications", () => {
    expect(() => assertConvertable("converted")).toThrow(ConflictError);
    expect(() => assertConvertable("submitted")).toThrow(BusinessRuleError);
    expect(() => assertConvertable("waitlisted")).toThrow(BusinessRuleError);
    expect(() => assertConvertable("approved")).not.toThrow();
    try {
      assertConvertable("under_review");
      expect.unreachable();
    } catch (error) {
      expect((error as BusinessRuleError).userMessage).toContain("only an approved");
    }
  });
});

describe("editability", () => {
  it("keeps open applications editable and freezes every decided outcome", () => {
    expect(() => assertAdmissionEditable("submitted")).not.toThrow();
    expect(() => assertAdmissionEditable("under_review")).not.toThrow();
    expect(() => assertAdmissionEditable("waitlisted")).not.toThrow();
    for (const status of ["approved", "rejected", "converted", "cancelled"] as const) {
      expect(() => assertAdmissionEditable(status)).toThrow(ConflictError);
    }
    try {
      assertAdmissionEditable("approved");
      expect.unreachable();
    } catch (error) {
      expect((error as ConflictError).userMessage).toContain("can no longer be edited");
    }
  });
});

describe("document decision rules", () => {
  it("lets a pending document be verified, or rejected with a reason", () => {
    expect(() =>
      assertAdmissionDocumentDecision("pending_verification", "verified", null),
    ).not.toThrow();
    expect(() =>
      assertAdmissionDocumentDecision("pending_verification", "rejected", "Photo is illegible."),
    ).not.toThrow();
  });

  it("refuses a decided document and a rejection without a readable reason", () => {
    expect(() =>
      assertAdmissionDocumentDecision("pending_verification", "rejected", "   "),
    ).toThrow(ConflictError);
    expect(() => assertAdmissionDocumentDecision("verified", "verified", null)).toThrow(
      BusinessRuleError,
    );
    expect(() => assertAdmissionDocumentDecision("expired", "rejected", "Stale")).toThrow(
      BusinessRuleError,
    );
    try {
      assertAdmissionDocumentDecision("rejected", "verified", null);
      expect.unreachable();
    } catch (error) {
      expect((error as BusinessRuleError).userMessage).toContain("not awaiting verification");
    }
  });
});

describe("timestamp patch", () => {
  const now = new Date("2026-10-08T10:00:00.000Z");
  const empty = { submittedAt: null, decidedAt: null, convertedAt: null } as const;

  it("stamps submission, first decision and conversion once each", () => {
    expect(admissionTimestampPatch("submitted", empty, now)).toEqual({ submittedAt: now });
    expect(admissionTimestampPatch("approved", empty, now)).toEqual({ decidedAt: now });
    expect(admissionTimestampPatch("converted", empty, now)).toEqual({ convertedAt: now });
    expect(admissionTimestampPatch("under_review", empty, now)).toEqual({});
  });

  it("treats waitlist and cancel as decisions for the stamp too", () => {
    expect(admissionTimestampPatch("waitlisted", empty, now)).toEqual({ decidedAt: now });
    expect(admissionTimestampPatch("cancelled", empty, now)).toEqual({ decidedAt: now });
  });

  it("never moves a timestamp already recorded", () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    const current = { submittedAt: old, decidedAt: old, convertedAt: old } as const;
    expect(admissionTimestampPatch("submitted", current, now)).toEqual({});
    expect(admissionTimestampPatch("rejected", current, now)).toEqual({});
    expect(admissionTimestampPatch("converted", current, now)).toEqual({});
  });
});

describe("advisory duplicate detection", () => {
  const base = { firstName: "Sara", lastName: "Khan", dateOfBirth: "2014-05-01" };

  it("matches on normalized name when dates agree or are missing", () => {
    expect(isLikelyDuplicate(base, { ...base })).toBe(true);
    expect(
      isLikelyDuplicate(base, { firstName: "  sara ", lastName: "KHAN", dateOfBirth: null }),
    ).toBe(true);
    expect(isLikelyDuplicate(base, { ...base, dateOfBirth: "2014-06-02" })).toBe(false);
    expect(isLikelyDuplicate(base, { ...base, firstName: "Omar" })).toBe(false);
    expect(isLikelyDuplicate({ ...base, firstName: "   " }, base)).toBe(false);
  });
});

describe("application number minting", () => {
  it("formats ADM-YYYYMMDD-SUFFIX", () => {
    expect(mintApplicationNumber(new Date("2026-01-05T00:00:00Z"), "9F2C")).toBe(
      "ADM-20260105-9F2C",
    );
  });
});
