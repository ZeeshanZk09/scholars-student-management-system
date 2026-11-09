/**
 * Sign-in failure copy — the single place where an application failure code becomes words a
 * user can act on.
 *
 * Two constraints shape every string here (`SECURITY.md` §62): the message for
 * `invalid_credentials` must be identical for unknown-email and wrong-password (it is — one
 * entry), and account-specific messages may only ever be shown to someone who already proved
 * they know the password (they are — `sign-in.ts` discloses them only after verification).
 */
import type { SignInFailureReason } from "../application/sign-in";

export const SIGN_IN_MESSAGES: Record<SignInFailureReason, string> = {
  invalid_credentials: "Email or password is incorrect.",
  rate_limited: "Too many attempts from this device. Wait a few minutes and try again.",
  account_locked:
    "Too many failed attempts. This account is temporarily locked — try again shortly, or reset your password.",
  email_verification_required: "Check your inbox for a verification link, then sign in again.",
  account_disabled: "This account can't sign in. Contact your administrator.",
};

/**
 * Map an Auth.js `signIn` response code to display copy. Unknown codes (framework defaults,
 * configuration failures) fall back to a generic string — prose never leaks from the server.
 */
export function messageForSignInCode(code: string | undefined): string {
  if (code && code in SIGN_IN_MESSAGES) {
    return SIGN_IN_MESSAGES[code as SignInFailureReason];
  }
  return "Sign-in failed. Please try again.";
}
