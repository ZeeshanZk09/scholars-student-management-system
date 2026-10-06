/**
 * Shell for every authenticated page (`PHASES.md` §13 tasks 2–3; the upgrade of the Phase 3/4
 * header into the full application shell).
 *
 * `requireSession` is the authoritative gate — no session ⇒ redirect to `/login` (`RULES.md` §56).
 * The layout then resolves the principal, filters the shared navigation model to what the
 * principal may actually use (`navigationFor`), and hands the result to the shell. The same
 * principal is serialized into `PermissionsProvider` so client components can *mirror* what the
 * server already decided — hide, never authorize (`RULES.md` §19).
 */
import { NAV_GROUPS, navigationFor } from "@/lib/navigation";
import { getCurrentPrincipal } from "@/lib/permissions";
import { requireSession } from "@/lib/dal";
import { hasPermission } from "@/shared/authorization";
import { PermissionsProvider } from "@/modules/authorization/ui/permissions-context";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const principal = await getCurrentPrincipal(null);
  const permissions = [...(principal?.permissions ?? [])];

  const navGroups = navigationFor(
    NAV_GROUPS,
    (permission) => principal !== null && hasPermission(principal, permission),
  );
  const primaryItems = navGroups.flatMap((group) => group.items.filter((item) => !item.disabled));

  return (
    <PermissionsProvider permissions={permissions}>
      <AppShell
        navGroups={navGroups}
        primaryItems={primaryItems}
        email={session.email ?? ""}
        name={session.name}
      >
        {children}
      </AppShell>
    </PermissionsProvider>
  );
}
