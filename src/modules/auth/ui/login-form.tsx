"use client";

/**
 * Credential sign-in form (Phase 3 task 6).
 *
 * The form calls `signIn("credentials", { redirect: false })` in the browser, which posts to
 * `/api/auth/callback/credentials` with real client headers — that is why the credentials
 * endpoint sees a genuine `x-forwarded-for` and `user-agent` for rate limiting and session
 * auditing. The response's `code` (set by `SignInFailed` in `src/auth.ts`) is the application's
 * failure reason; `messages.ts` turns it into copy. Only the bare failure reaches the server
 * logs — the form never echoes codes or stack traces back to the page.
 */
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { messageForSignInCode } from "./messages";

/**
 * The post-login destination comes from `proxy.ts`'s `callbackUrl` redirect.
 *
 * It is attacker-controllable input, so only same-site *paths* are honoured: a bare
 * `/segment` with neither scheme, host, backslash nor protocol-relative `//` prefix. Anything
 * else falls back to `/` (the open-redirect defence also enforced server-side by Auth.js's
 * `redirect` callback — this is the client half of the same rule).
 */
function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export function LoginForm({ notice }: { notice?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const callbackUrl = safeCallbackUrl(
      new URLSearchParams(window.location.search).get("callbackUrl"),
    );

    startTransition(async () => {
      const response = await signIn("credentials", {
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
        redirect: false,
      });

      if (response?.error) {
        setError(messageForSignInCode(response.code));
        return;
      }

      // Success: navigate server-side so layouts re-render with the new session cookie.
      router.push(callbackUrl);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" aria-busy={pending}>
      {notice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          disabled={pending}
          aria-invalid={error !== null || undefined}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          disabled={pending}
          aria-invalid={error !== null || undefined}
        />
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="flex justify-between text-xs">
        <a
          className="text-muted-foreground underline-offset-4 hover:underline"
          href="/forgot-password"
        >
          Forgot password?
        </a>
        <a
          className="text-muted-foreground underline-offset-4 hover:underline"
          href="/verify-email"
        >
          Verify email
        </a>
      </div>
    </form>
  );
}
