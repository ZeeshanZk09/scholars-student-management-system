"use server";

/**
 * Auth server actions (Phase 3 tasks 7, 10, 11).
 *
 * Server actions are the only path from `ui/` into the auth module's use cases — the layering
 * rule in `src/modules/README.md`. Each action returns a small serialisable state for
 * `useActionState`; no prose ever doubles as a protocol (the client switches on `status`,
 * never on message text).
 *
 * `headers()` (awaited — Next 16 returns a Promise) carries the real client IP and user agent
 * for rate limiting and session audit columns, exactly as the credentials callback does for
 * sign-in.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { completePasswordReset, requestPasswordResetEmail } from "@/modules/auth";

import { signOut } from "@/auth";

export type FormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly issues?: readonly string[] }
  | { readonly status: "done"; readonly message: string };

/** Client origin facts for rate-limit keys and session audit columns. */
async function requestOrigin(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  return { ipAddress, userAgent: h.get("user-agent") };
}

/**
 * "Send me a reset link" (task 10). The result is enumeration-safe by construction: the
 * application layer answers `ok` for unknown addresses, so this action can't distinguish
 * them either — and says the same thing either way.
 */
export async function requestPasswordResetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (email.length === 0) {
    return { status: "error", message: "Enter your email address." };
  }

  try {
    const origin = await requestOrigin();
    const result = await requestPasswordResetEmail({ email, now: new Date(), origin });
    if (!result.ok) {
      return {
        status: "error",
        message: "Too many requests. Wait a few minutes and try again.",
      };
    }
    return {
      status: "done",
      message: "If that address has an account, a password reset link is on its way.",
    };
  } catch {
    // Deliberately uniform: an infrastructure fault must not become an oracle either.
    return {
      status: "done",
      message: "If that address has an account, a password reset link is on its way.",
    };
  }
}

/**
 * Consume a reset token (task 11). Order matches the application layer: policy feedback
 * arrives *before* the single-use consume, so a rejected password never burns the link.
 */
export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (token.length === 0) {
    return { status: "error", message: "This reset link is malformed. Request a new one." };
  }
  if (password !== confirmation) {
    return { status: "error", message: "The passwords don't match." };
  }

  let result: Awaited<ReturnType<typeof completePasswordReset>>;
  try {
    result = await completePasswordReset({ token, password, now: new Date() });
  } catch {
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
    };
  }

  if (!result.ok) {
    if (result.reason === "weak_password") {
      return {
        status: "error",
        message: "That password doesn't meet the requirements.",
        issues: result.issues,
      };
    }
    return {
      status: "error",
      message: "This reset link has expired or was already used. Request a new one.",
    };
  }

  // The application revoked every session (password change = log out everywhere), so the
  // login page with a confirmation is the correct next stop. redirect() throws NEXT_REDIRECT,
  // which must stay outside any catch.
  redirect("/login?reset=1");
}

/** Task 7: revoke the row, clear the cookie, land on the sign-in page. */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
