/**
 * Time slots (`PHASES.md` Phase 6, task 7). The school day broken into named periods, in
 * `sequence` order — the shape the timetable phase will consume later, and the reason breaks are
 * modelled as ordinary rows (`isBreak`) rather than an exception: the scheduler walks one ordered
 * list, so "Recess" has to be a slot like any other.
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
import { ClockIcon } from "@/components/ui/icons";
import { listAcademicSessions, listTimeSlots } from "@/modules/academic";
import { CreateTimeSlotDialog } from "@/modules/academic/ui/time-slot-form";

import { AcademicPage } from "../_lib/academic-page";

/** Postgres `time` arrives as `HH:MM:SS`; the minutes are all the schedule needs. */
function toClock(value: string): string {
  return value.length === 8 ? value.slice(0, 5) : value;
}

export default async function TimeSlotsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Time Slots"
      description="The periods that make up a school day, in order — including breaks."
      searchParams={searchParams}
      actions={async ({ institution }) => {
        if (institution === null) return null;
        const sessions = await listAcademicSessions(institution.id);
        return <CreateTimeSlotDialog institutionId={institution.id} sessions={sessions} />;
      }}
      render={async ({ institution }) => {
        const slots = await listTimeSlots(institution.id);
        const ordered = [...slots].sort((a, b) => a.sequence - b.sequence);

        if (ordered.length === 0) {
          return (
            <EmptyState
              icon={ClockIcon}
              title="No time slots yet"
              description="Define the periods of the school day — period one, recess, lunch — in order. The timetable is built from them."
            />
          );
        }

        return (
          <div className="overflow-x-auto rounded-none border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <span className="sr-only">Order</span>#
                  </TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="hidden sm:table-cell">Session</TableHead>
                  <TableHead className="hidden sm:table-cell">Kind</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((slot) => (
                  <TableRow key={slot.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {slot.sequence}
                    </TableCell>
                    <TableCell className="font-medium">{slot.name}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {toClock(slot.startTime)} – {toClock(slot.endTime)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {slot.academicSessionName ?? (
                        <span className="text-muted-foreground">All sessions</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {slot.isBreak ? (
                        <Badge variant="secondary">Break</Badge>
                      ) : (
                        <Badge variant="outline">Period</Badge>
                      )}
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
