/**
 * Rendered bodies for the auth emails — pure functions, no I/O.
 *
 * The URL is built by the caller (which owns `APP_BASE_URL`) and passed in as data, keeping
 * this module free of environment reads. Bodies are plain text: `email_messages.body_text`
 * satisfies the outbox's body check, and an auth link needs no HTML (`RULES.md` — the message
 * is rendered at queue time, so a wording change cannot alter mail already queued).
 */

export interface RenderedEmail {
  readonly subject: string;
  readonly bodyText: string;
}

export function buildVerificationEmail(input: { url: string }): RenderedEmail {
  return {
    subject: "Verify your Scholars account",
    bodyText:
      "Welcome to Scholars.\n\n" +
      "Confirm this email address by opening the link below (valid for 24 hours):\n" +
      `${input.url}\n\n` +
      "If you did not create this account, you can ignore this message.\n",
  };
}

export function buildPasswordResetEmail(input: { url: string }): RenderedEmail {
  return {
    subject: "Reset your Scholars password",
    bodyText:
      "Someone requested a password reset for your Scholars account.\n\n" +
      "Open the link below to choose a new password (valid for 60 minutes, single use):\n" +
      `${input.url}\n\n` +
      "If this was not you, no action is needed — your password has not changed. " +
      "Resetting will sign out all your sessions.\n",
  };
}
