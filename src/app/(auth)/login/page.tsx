import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/modules/auth/ui/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Sign-in page (Phase 3 task 6).
 *
 * Server component: renders the chrome and passes only the URL-derived notice through.
 * `?reset=1` is set by `resetPasswordAction` after a successful reset — at that point every
 * session was revoked, so "choose a new password" → "sign in" is the intended path.
 */
export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ reset?: string }>;
}>) {
  const { reset } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scholars</CardTitle>
        <CardDescription>Sign in to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          notice={reset === "1" ? "Password updated. Sign in with your new password." : null}
        />
      </CardContent>
    </Card>
  );
}
