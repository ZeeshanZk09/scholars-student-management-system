import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeEmailVerification } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Verify your email",
};

/**
 * Verification-link landing page (Phase 3 task 9).
 *
 * Consuming the token here, during the server render, keeps the flow a plain link click —
 * no confirmation button, no client round-trip. The consume is atomic in the store, so a
 * double-click (or a concurrent tab) renders the already-used outcome, not a second
 * activation.
 *
 * Unknown, expired and already-consumed tokens are one outcome on purpose: the response must
 * not say which, to anyone (`SECURITY.md` §62).
 */
export default async function VerifyEmailPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ token?: string | string[] }>;
}>) {
  const { token } = await searchParams;
  const normalized = typeof token === "string" && token.length > 0 ? token : null;

  const result = normalized
    ? await completeEmailVerification({ token: normalized, now: new Date() })
    : null;

  const verified = result?.ok === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{verified ? "Email verified" : "Verification link"}</CardTitle>
        <CardDescription>
          {verified
            ? "Your account is active — you can sign in now."
            : "This link is no longer valid."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {!verified ? (
          <p className="text-xs text-muted-foreground">
            Links expire after 24 hours and work once. Request a new one from your invitation email
            or ask your administrator to resend it.
          </p>
        ) : null}
        <Link href="/login" className="text-xs underline underline-offset-4">
          Go to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
