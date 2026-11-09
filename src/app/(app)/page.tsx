/**
 * The application dashboard (`PHASES.md` §13 task 4) — the first real use of the shell.
 *
 * Honest by construction: the only live numbers are counts of records the seed actually created
 * (`users`, `roles`, `permissions`), so nothing is invented until later phases populate it. The
 * module map below is the same `NAV_GROUPS` model the sidebar renders, filtered through the
 * principal's capabilities, so a teacher and a super-admin literally see different dashboards —
 * `DESIGN.md` §10's role-aware home.
 */
import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  ChalkboardTeacherIcon,
  ClipboardTextIcon,
  ReceiptIcon,
  StudentIcon,
} from "@/components/ui/icons";
import { requireSession } from "@/lib/dal";
import { getCurrentPrincipal } from "@/lib/permissions-server";
import { NAV_GROUPS, navigationFor } from "@/lib/navigation";
import { hasPermission } from "@/shared/authorization";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { admissions, feeInvoices, students, teachers } from "@/db/schema";

export default async function Home() {
  const session = await requireSession();
  const principal = await getCurrentPrincipal();

  const institutionId = principal?.institutionId;

  const [studentCount, teacherCount, admissionCount, invoiceCount] = await Promise.all([
    institutionId
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(students)
          .where(and(eq(students.institutionId, institutionId), isNull(students.archivedAt)))
      : db
          .select({ count: sql<number>`count(*)::int` })
          .from(students)
          .where(isNull(students.archivedAt)),
    institutionId
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(teachers)
          .where(and(eq(teachers.institutionId, institutionId), isNull(teachers.archivedAt)))
      : db
          .select({ count: sql<number>`count(*)::int` })
          .from(teachers)
          .where(isNull(teachers.archivedAt)),
    institutionId
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(admissions)
          .where(eq(admissions.institutionId, institutionId))
      : db.select({ count: sql<number>`count(*)::int` }).from(admissions),
    institutionId
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(feeInvoices)
          .where(eq(feeInvoices.institutionId, institutionId))
      : db.select({ count: sql<number>`count(*)::int` }).from(feeInvoices),
  ]);

  const [studentRow] = studentCount;
  const [teacherRow] = teacherCount;
  const [admissionRow] = admissionCount;
  const [invoiceRow] = invoiceCount;

  const navGroups = navigationFor(
    NAV_GROUPS,
    (permission) => principal !== null && hasPermission(principal, permission),
  );

  const grants = [...(principal?.permissions ?? [])].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${session.name}. Here is what is live in your school workspace.`}
        breadcrumb={[{ label: "Home" }]}
      />

      <section
        aria-label="Live counts"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label="Enrolled Students"
          value={studentRow?.count ?? 0}
          hint="Active registered students"
          icon={StudentIcon}
        />
        <StatCard
          label="Active Teachers"
          value={teacherRow?.count ?? 0}
          hint="Faculty members"
          icon={ChalkboardTeacherIcon}
        />
        <StatCard
          label="Admissions"
          value={admissionRow?.count ?? 0}
          hint="Applications logged"
          icon={ClipboardTextIcon}
        />
        <StatCard
          label="Fee Invoices"
          value={invoiceRow?.count ?? 0}
          hint="Total fee invoices issued"
          icon={ReceiptIcon}
        />
      </section>

      <section aria-label="Module map" className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Modules & Quick Launch</h2>
          <p className="text-xs text-muted-foreground">
            Select an active module to begin work. Items marked Planned ship in scheduled phases.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {navGroups.map((group) => (
            <Card key={group.label} className="rounded-none shadow-none">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">{group.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.items.map((item) =>
                  item.disabled ? (
                    <div
                      key={item.href}
                      className="flex items-center justify-between gap-2 p-1.5 opacity-60"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-muted-foreground *:size-4"
                        >
                          <item.icon />
                        </span>
                        <span className="truncate text-sm">{item.label}</span>
                      </div>
                      <Badge variant="secondary">Planned</Badge>
                    </div>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between gap-2 p-1.5 -mx-1.5 rounded hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-muted-foreground *:size-4"
                        >
                          <item.icon />
                        </span>
                        <span className="truncate text-sm font-medium">{item.label}</span>
                      </div>
                      <StatusBadge tone="success">Open</StatusBadge>
                    </Link>
                  ),
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <details className="group border border-border bg-card p-4 transition-all">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-between select-none">
          <span>Security & Assigned Permissions ({grants.length} grants)</span>
          <span className="text-[10px] uppercase font-mono tracking-wider group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>
        <div className="mt-3 pt-3 border-t border-border">
          {grants.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Your account currently holds no specific capabilities. Contact a school administrator.
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
        </div>
      </details>
    </div>
  );
}
