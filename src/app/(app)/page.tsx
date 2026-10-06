/**
 * The application dashboard (`PHASES.md` §13 task 4) — the first real use of the shell.
 *
 * Honest by construction: the only live numbers are counts of records the seed actually created
 * (`users`, `roles`, `permissions`), so nothing is invented until later phases populate it. The
 * module map below is the same `NAV_GROUPS` model the sidebar renders, filtered through the
 * principal's capabilities, so a teacher and a super-admin literally see different dashboards —
 * `DESIGN.md` §10's role-aware home.
 */
import { KeyIcon, ShieldCheckIcon, UsersIcon } from "@/components/ui/icons";
import { sql } from "drizzle-orm";

import { requireSession } from "@/lib/dal";
import { getCurrentPrincipal } from "@/lib/permissions";
import { NAV_GROUPS, navigationFor } from "@/lib/navigation";
import { hasPermission } from "@/shared/authorization";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { permissions, roles, users } from "@/db/schema";

export default async function Home() {
  const session = await requireSession();
  const principal = await getCurrentPrincipal(null);

  const [userCount, roleCount, permissionCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(roles),
    db.select({ count: sql<number>`count(*)::int` }).from(permissions),
  ]);
  const [userRow] = userCount;
  const [roleRow] = roleCount;
  const [permissionRow] = permissionCount;

  const navGroups = navigationFor(
    NAV_GROUPS,
    (permission) => principal !== null && hasPermission(principal, permission),
  );

  const grants = [...(principal?.permissions ?? [])].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${session.name}. Here is what is live in your workspace right now.`}
        breadcrumb={[{ label: "Home" }]}
      />

      <section
        aria-label="Live counts"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <StatCard
          label="Users"
          value={userRow?.count ?? 0}
          hint="Signed-in principals"
          icon={UsersIcon}
        />
        <StatCard
          label="Roles"
          value={roleRow?.count ?? 0}
          hint="System role bundles"
          icon={ShieldCheckIcon}
        />
        <StatCard
          label="Permissions"
          value={permissionRow?.count ?? 0}
          hint="Capabilities in the registry"
          icon={KeyIcon}
        />
      </section>

      <Card className="rounded-none shadow-none">
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-medium">Your capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Your account currently holds no capabilities. Ask an administrator to assign you a
              role.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {grants.map((key) => (
                <li key={key}>
                  <StatusBadge tone="neutral" dot={false}>
                    {key}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-label="Module map" className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Modules</h2>
          <p className="text-xs text-muted-foreground">
            The modules your account can reach. Items marked Planned ship in later phases.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {navGroups.map((group) => (
            <Card key={group.label} className="rounded-none shadow-none">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">{group.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.href} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="shrink-0 text-muted-foreground *:size-4">
                        <item.icon />
                      </span>
                      <span className="truncate text-sm">{item.label}</span>
                    </div>
                    {item.disabled ? (
                      <Badge variant="secondary">Planned</Badge>
                    ) : (
                      <StatusBadge tone="success">Available</StatusBadge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
