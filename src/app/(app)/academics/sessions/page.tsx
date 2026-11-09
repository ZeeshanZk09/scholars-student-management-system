/**
 * Academic sessions (`PHASES.md` Phase 6, task 2 — academic years, and task 11 historical
 * preservation).
 *
 * The lifecycle the domain enforces (`domain-rules.ts`) is surfaced here rather than left to fail
 * on submit: **current** is a badge and a disabled button, **closed** rows lose their actions
 * entirely, and "Close" is only offered where `assertCanClose` would accept it — a session can be
 * closed only once a successor is current, which is why the close control disappears on the
 * current row instead of promising a refusal.
 */
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarBlankIcon } from "@/components/ui/icons";
import { listAcademicSessions } from "@/modules/academic";
import {
  CloseSessionDialog,
  CreateSessionDialog,
  SetCurrentSessionButton,
} from "@/modules/academic/ui/session-forms";

import { AcademicPage } from "../_lib/academic-page";

export default async function SessionsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Sessions"
      description="Academic years: create them, mark one current, close the rest."
      searchParams={searchParams}
      actions={(ctx) =>
        ctx.institution === null ? null : <CreateSessionDialog institutionId={ctx.institution.id} />
      }
      render={async ({ institution }) => {
        const sessions = await listAcademicSessions(institution.id);

        if (sessions.length === 0) {
          return (
            <EmptyState
              icon={CalendarBlankIcon}
              title="No sessions yet"
              description="An academic session is a school year. Classes belong to one, so add a session before anything else."
            />
          );
        }

        return (
          <div className="overflow-x-auto rounded-none border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="hidden sm:table-cell">Structure</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {session.startDate} → {session.endDate}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {session.classCount} classes · {session.groupCount} groups ·{" "}
                      {session.sectionCount} sections
                    </TableCell>
                    <TableCell>
                      <SessionBadges
                        isCurrent={session.isCurrent}
                        isClosed={session.closedAt !== null}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-2">
                        {!session.isCurrent && session.closedAt === null && (
                          <SetCurrentSessionButton
                            institutionId={institution.id}
                            session={session}
                          />
                        )}
                        {!session.isCurrent && session.closedAt === null && (
                          <CloseSessionDialog institutionId={institution.id} session={session} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      }}
    />
  );
}

function SessionBadges({
  isCurrent,
  isClosed,
}: Readonly<{ isCurrent: boolean; isClosed: boolean }>) {
  if (isClosed) {
    return <Badge variant="secondary">Closed</Badge>;
  }
  if (isCurrent) {
    return <Badge>Current</Badge>;
  }
  return <Badge variant="outline">Open</Badge>;
}
