/**
 * The data-access layer for sessions — the one function every protected server component,
 * layout and server action asks "who is this?" (`ARCHITECTURE.md` §DAL, Phase 3 task 8).
 *
 * Two shapes, split by intent:
 *
 * - `verifySession` — ask, don't insist. `React.cache` deduplicates within a single render, so
 *   a layout and its page each calling it produce one `auth()` (and therefore one `jwt`
 *   callback, one DB session check) per request.
 * - `requireSession` — insist. Redirects to `/login` when there is no session; never returns
 *   null, so callers can't forget to handle it.
 *
 * Both read only `session.user.id` (plus display fields). The `sid` revocation handle exists
 * solely inside the `jwt` callback (`src/auth.ts`) and is never exposed to page code.
 */
import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export interface AuthSession {
  readonly userId: string;
  readonly email: string | null;
  readonly name: string | null;
}

export const verifySession = cache(async (): Promise<AuthSession | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return {
    userId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
});

export async function requireSession(): Promise<AuthSession> {
  const session = await verifySession();
  if (session === null) {
    redirect("/login");
  }
  return session;
}
