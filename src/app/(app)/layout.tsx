/**
 * Shell for every authenticated page (Phase 3 task 14 — server-side guards in layouts; Phase 4
 * task 10 — permission-aware UI).
 *
 * `requireSession` is the authoritative check: no session ⇒ redirect to `/login`. The `jwt`
 * callback has already verified the `sid` against the `sessions` row by the time `auth()`
 * resolves here, so a revoked, expired or suspended account fails this gate on the very next
 * request. `src/proxy.ts` performs a cheaper, cookie-only pre-redirect earlier in the pipe —
 * if it were ever bypassed, this layout still holds.
 *
 * The resolved principal is serialized into `PermissionsProvider` so client components can
 * mirror what the server already decided (hide, never authorize — `RULES.md` §19).
 */
import { logoutAction } from "@/modules/auth/ui/actions";
import { Button } from "@/components/ui/button";
import { PermissionsProvider } from "@/modules/authorization/ui/permissions-context";
import { requireSession } from "@/lib/dal";
import { getCurrentPrincipal } from "@/lib/permissions";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const principal = await getCurrentPrincipal(null);

  return (
    <PermissionsProvider permissions={[...(principal?.permissions ?? [])]}>
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-xs font-medium">Scholars</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{session.email}</span>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="xs">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </PermissionsProvider>
  );
}
