import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/modules/auth/ui/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
};

/**
 * Reset-link landing page (Phase 3 task 11).
 *
 * The token is validated only at consumption time (in the server action) — rendering the form
 * for any string keeps the page itself an oracle-free static render. A link without a token
 * is malformed by definition and says so, which reveals nothing (no token means no lookup).
 */
export default async function ResetPasswordPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ token?: string | string[] }>;
}>) {
  const { token } = await searchParams;
  const normalized = typeof token === "string" && token.length > 0 ? token : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          {normalized ? "Pick something you don't use anywhere else." : "This link is incomplete."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {normalized ? (
          <ResetPasswordForm token={normalized} />
        ) : (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              Request a fresh reset link and use it within the hour.
            </p>
            <Link href="/forgot-password" className="text-xs underline underline-offset-4">
              Request a new link
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
