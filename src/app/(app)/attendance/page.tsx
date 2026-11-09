/**
 * Daily Attendance Dashboard (`ARCHITECTURE.md` §17–§18, `PRD.md` MODULE 17).
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarBlankIcon,
  CheckCircleIcon,
  ClockIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAcademicSessions, listClassTree, listTimeSlots } from "@/modules/academic";
import { listDailyAttendanceSessions } from "@/modules/attendance";

import { InstitutionPage } from "../_lib/institution-page";

export default async function AttendanceDashboardPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="attendance.view"
      title="Attendance"
      description="Daily period registers, live class completion rates, and audited corrections."
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Attendance" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view or take student attendance."
      empty={{
        chooseInstitution:
          "Choose an institution in the selector above to access its daily attendance registers.",
        noInstitution: "No institution is available. Create one to begin tracking attendance.",
        noMembership: "You are not a member of any institution yet.",
      }}
      render={async ({ institution }) => {
        const params = await searchParams;
        const requestedDate = typeof params.date === "string" ? params.date : undefined;
        const todayDate = requestedDate ?? new Date().toISOString().slice(0, 10);

        const [sessions, timeSlots] = await Promise.all([
          listAcademicSessions(institution.id),
          listTimeSlots(institution.id),
        ]);

        const currentSession = sessions.find((s) => s.isCurrent) ?? sessions[0];
        if (!currentSession) {
          return (
            <EmptyState
              icon={CalendarBlankIcon}
              title="No active academic session"
              description="An academic session must be created and marked current before taking attendance."
            />
          );
        }

        const classTree = await listClassTree(institution.id, currentSession.id);

        // Flatten all sections across classes and groups
        const flatSections: Array<{
          sectionId: string;
          sectionName: string;
          className: string;
          groupName: string;
        }> = [];

        for (const cls of classTree) {
          for (const grp of cls.groups) {
            for (const sec of grp.sections) {
              flatSections.push({
                sectionId: sec.id,
                sectionName: sec.name,
                className: cls.name,
                groupName: grp.name,
              });
            }
          }
        }

        if (flatSections.length === 0) {
          return (
            <EmptyState
              icon={UsersIcon}
              title="No classes or sections configured"
              description="Create classes and sections under Academics before taking attendance."
            />
          );
        }

        // Fetch daily sessions for all sections today
        const sectionIds = flatSections.map((s) => s.sectionId);
        const dailySessions = await listDailyAttendanceSessions(sectionIds, todayDate);

        const defaultSlot = timeSlots[0];
        const slotSessions = defaultSlot
          ? dailySessions.filter((s) => s.timeSlotId === defaultSlot.id)
          : dailySessions;

        // Metrics
        let submittedCount = 0;
        let inProgressCount = 0;
        for (const sec of flatSections) {
          const sess = slotSessions.find((s) => s.sectionId === sec.sectionId);
          if (sess?.status === "submitted") submittedCount++;
          else if (sess?.status === "in_progress") inProgressCount++;
        }
        const notStartedCount = flatSections.length - submittedCount - inProgressCount;

        return (
          <div className="space-y-6">
            {/* Header KPI summary */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground">Total Sections</div>
                <div className="text-2xl font-bold tracking-tight">{flatSections.length}</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCircleIcon className="size-4 text-emerald-600" />
                  <span>Registers Submitted</span>
                </div>
                <div className="text-2xl font-bold text-emerald-600">{submittedCount}</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <ClockIcon className="size-4 text-amber-600" />
                  <span>In Progress</span>
                </div>
                <div className="text-2xl font-bold text-amber-600">{inProgressCount}</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground">Not Started</div>
                <div className="text-2xl font-bold text-muted-foreground">{notStartedCount}</div>
              </div>
            </div>

            {/* Date & Period Scope Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <CalendarBlankIcon className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">Viewing Register Date: <strong>{todayDate}</strong></span>
                {defaultSlot && (
                  <span className="text-xs text-muted-foreground">
                    • Slot: <strong>{defaultSlot.name}</strong>
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Current Academic Session: <strong>{currentSession.name}</strong>
              </div>
            </div>

            {/* Sections Register Directory */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class & Section</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Today&apos;s Status</TableHead>
                    <TableHead>Marks Recorded</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flatSections.map((sec) => {
                    const session = slotSessions.find((s) => s.sectionId === sec.sectionId);
                    const isDone = session?.status === "submitted";
                    const isInProg = session?.status === "in_progress";

                    return (
                      <TableRow key={sec.sectionId}>
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {sec.className} — {sec.sectionName}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {sec.groupName}
                        </TableCell>
                        <TableCell>
                          {isDone ? (
                            <Badge variant="default">Submitted</Badge>
                          ) : isInProg ? (
                            <Badge variant="secondary">In Progress</Badge>
                          ) : (
                            <Badge variant="outline">Not Started</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {session ? `${session.markedCount} / ${session.totalStudents}` : "0 recorded"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" render={<Link href={`/attendance/${sec.sectionId}?date=${todayDate}&institution=${encodeURIComponent(institution.id)}`} />}>
                            {isDone ? "View Register" : "Take Attendance"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      }}
    />
  );
}
