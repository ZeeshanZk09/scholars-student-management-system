import { describe, expect, it } from "vitest";

import { BusinessRuleError } from "@/shared/errors";
import {
  calculateNextRetryAttempt,
  canTransitionEmailStatus,
  classifyBounce,
  extractTemplateVariables,
  generateEmailIdempotencyKey,
  isEmailSuppressed,
  renderTemplate,
  transitionEmailStatus,
  validateTemplateSubstitution,
  type EmailStatus,
} from "./email-rules";

describe("email-rules domain", () => {
  describe("delivery status state machine", () => {
    it("permits self-transitions (no-op)", () => {
      const statuses: EmailStatus[] = ["queued", "sending", "sent", "failed", "suppressed"];
      for (const status of statuses) {
        expect(canTransitionEmailStatus(status, status)).toBe(true);
        expect(transitionEmailStatus(status, status)).toBe(status);
      }
    });

    it("permits legal forward transitions from queued", () => {
      expect(canTransitionEmailStatus("queued", "sending")).toBe(true);
      expect(canTransitionEmailStatus("queued", "suppressed")).toBe(true);
      expect(canTransitionEmailStatus("queued", "failed")).toBe(true);
      expect(transitionEmailStatus("queued", "sending")).toBe("sending");
    });

    it("permits legal forward transitions from sending", () => {
      expect(canTransitionEmailStatus("sending", "sent")).toBe(true);
      expect(canTransitionEmailStatus("sending", "failed")).toBe(true);
      expect(canTransitionEmailStatus("sending", "queued")).toBe(true);
      expect(canTransitionEmailStatus("sending", "suppressed")).toBe(true);
      expect(transitionEmailStatus("sending", "sent")).toBe("sent");
    });

    it("permits re-queueing from failed", () => {
      expect(canTransitionEmailStatus("failed", "queued")).toBe(true);
      expect(transitionEmailStatus("failed", "queued")).toBe("queued");
    });

    it("treats sent and suppressed as terminal states", () => {
      expect(canTransitionEmailStatus("sent", "queued")).toBe(false);
      expect(canTransitionEmailStatus("sent", "sending")).toBe(false);
      expect(canTransitionEmailStatus("sent", "failed")).toBe(false);
      expect(canTransitionEmailStatus("suppressed", "queued")).toBe(false);
      expect(canTransitionEmailStatus("suppressed", "sending")).toBe(false);

      expect(() => transitionEmailStatus("sent", "sending")).toThrow(BusinessRuleError);
      expect(() => transitionEmailStatus("suppressed", "queued")).toThrow(BusinessRuleError);
    });

    it("throws BusinessRuleError on illegal transitions", () => {
      expect(() => transitionEmailStatus("queued", "sent")).toThrow(BusinessRuleError);
      expect(() => transitionEmailStatus("failed", "sent")).toThrow(BusinessRuleError);
    });
  });

  describe("template variable substitution", () => {
    it("extracts unique variable names from template strings", () => {
      const template = "Hello {{ student_name }}, your exam date is {{date}}! See {{student_name}}'s marks.";
      const vars = extractTemplateVariables(template);
      expect(vars).toEqual(["student_name", "date"]);
    });

    it("substitutes variables correctly into template", () => {
      const template = "Dear {{parent_name}}, {{student_name}} scored {{marks}}% in {{subject}}.";
      const rendered = renderTemplate(template, {
        parent_name: "Ahmad",
        student_name: "Bilal",
        marks: 95,
        subject: "Mathematics",
      });
      expect(rendered).toBe("Dear Ahmad, Bilal scored 95% in Mathematics.");
    });

    it("evaluates missing or null variables to empty strings", () => {
      const template = "Hello {{name}}, code: {{code}}, notes: {{notes}}.";
      const rendered = renderTemplate(template, {
        name: "Zeeshan",
        code: null,
      });
      expect(rendered).toBe("Hello Zeeshan, code: , notes: .");
    });

    it("validates that all required variables are present and not empty", () => {
      const template = {
        requiredVariables: ["student_name", "report_url"],
      };

      const validResult = validateTemplateSubstitution(template, {
        student_name: "Bilal",
        report_url: "https://school.edu/report/123",
        extra: "optional",
      });
      expect(validResult.isValid).toBe(true);
      expect(validResult.missingVariables).toEqual([]);

      const invalidResult = validateTemplateSubstitution(template, {
        student_name: "Bilal",
        report_url: "",
      });
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.missingVariables).toEqual(["report_url"]);
    });
  });

  describe("bounce handling & SMTP classification", () => {
    it("identifies network and socket connection errors as transient retryable", () => {
      const connRefused = classifyBounce("ECONNREFUSED");
      expect(connRefused.category).toBe("connection_failure");
      expect(connRefused.shouldRetry).toBe(true);
      expect(connRefused.isHardBounce).toBe(false);

      const timeout = classifyBounce(null, "Connection timed out after 10000ms");
      expect(timeout.category).toBe("connection_failure");
      expect(timeout.shouldRetry).toBe(true);
    });

    it("identifies 250 as successful delivery", () => {
      const accepted = classifyBounce(250, "OK 250 Message accepted");
      expect(accepted.category).toBe("accepted");
      expect(accepted.isHardBounce).toBe(false);
      expect(accepted.shouldRetry).toBe(false);
    });

    it("identifies 4xx SMTP codes as soft bounces / transient errors to retry", () => {
      const c421 = classifyBounce(421, "Service not available");
      expect(c421.category).toBe("transient_error");
      expect(c421.shouldRetry).toBe(true);

      const c450 = classifyBounce("450", "Mailbox busy");
      expect(c450.category).toBe("soft_bounce");
      expect(c450.shouldRetry).toBe(true);

      const c451 = classifyBounce(451, "Greylisted, please try again later");
      expect(c451.category).toBe("transient_error");
      expect(c451.shouldRetry).toBe(true);

      const c452 = classifyBounce(452, "Insufficient system storage");
      expect(c452.category).toBe("rate_limit");
      expect(c452.shouldRetry).toBe(true);
    });

    it("identifies 535 as an authentication failure that should not be automatically retried", () => {
      const c535 = classifyBounce(535, "5.7.8 Authentication credentials invalid");
      expect(c535.category).toBe("auth_failure");
      expect(c535.isPermanent).toBe(true);
      expect(c535.shouldRetry).toBe(false);
    });

    it("identifies 550, 551, 553, 554 as permanent hard bounces", () => {
      const c550 = classifyBounce(550, "5.1.1 User unknown");
      expect(c550.category).toBe("hard_bounce");
      expect(c550.isHardBounce).toBe(true);
      expect(c550.isPermanent).toBe(true);
      expect(c550.shouldRetry).toBe(false);

      const c553 = classifyBounce("553", "Invalid address syntax");
      expect(c553.category).toBe("hard_bounce");
      expect(c553.shouldRetry).toBe(false);
    });

    it("detects rate-limiting keywords in message text", () => {
      const rateLimited = classifyBounce(undefined, "Too many connections, rate exceeded");
      expect(rateLimited.category).toBe("rate_limit");
      expect(rateLimited.shouldRetry).toBe(true);
    });
  });

  describe("retry and backoff calculations", () => {
    it("calculates exponential backoff with base delay", () => {
      const now = Date.now();
      const attempt1 = calculateNextRetryAttempt({
        attemptCount: 1,
        maxAttempts: 5,
        baseDelaySeconds: 60,
      });
      expect(attempt1).not.toBeNull();
      // 60 * 2^0 = 60s
      expect(attempt1!.getTime()).toBeGreaterThanOrEqual(now + 59_000);
      expect(attempt1!.getTime()).toBeLessThanOrEqual(now + 62_000);

      const attempt3 = calculateNextRetryAttempt({
        attemptCount: 3,
        maxAttempts: 5,
        baseDelaySeconds: 60,
      });
      // 60 * 2^2 = 240s
      expect(attempt3!.getTime()).toBeGreaterThanOrEqual(now + 239_000);
    });

    it("returns null when attempts are exhausted", () => {
      const result = calculateNextRetryAttempt({
        attemptCount: 5,
        maxAttempts: 5,
      });
      expect(result).toBeNull();
    });

    it("respects maxDelaySeconds limit", () => {
      const now = Date.now();
      const result = calculateNextRetryAttempt({
        attemptCount: 10,
        maxAttempts: 15,
        baseDelaySeconds: 100,
        maxDelaySeconds: 300,
      });
      expect(result!.getTime()).toBeLessThanOrEqual(now + 302_000);
    });
  });

  describe("idempotency key generation", () => {
    it("generates deterministic keys with lowercased email", () => {
      const key1 = generateEmailIdempotencyKey({
        eventKey: "daily_diary",
        relatedEntityId: "123e4567-e89b-12d3-a456-426614174000",
        toEmail: "Parent@Example.COM ",
      });
      const key2 = generateEmailIdempotencyKey({
        eventKey: "daily_diary",
        relatedEntityId: "123e4567-e89b-12d3-a456-426614174000",
        toEmail: "parent@example.com",
      });
      expect(key1).toBe(key2);
      expect(key1).toBe("daily_diary:123e4567-e89b-12d3-a456-426614174000:parent@example.com");
    });

    it("handles null entity id and caps length at 160 characters", () => {
      const key = generateEmailIdempotencyKey({
        eventKey: "test_event".repeat(20),
        relatedEntityId: null,
        toEmail: "test@example.com",
      });
      expect(key.length).toBeLessThanOrEqual(160);
    });
  });

  describe("suppression list inspection", () => {
    it("checks case-insensitively whether email is suppressed", () => {
      const suppressedList = ["bounced@example.com", "spam@domain.org"];
      expect(isEmailSuppressed("bounced@example.com", suppressedList)).toBe(true);
      expect(isEmailSuppressed("BOUNCED@example.com", suppressedList)).toBe(true);
      expect(isEmailSuppressed("clean@example.com", suppressedList)).toBe(false);
    });
  });
});
