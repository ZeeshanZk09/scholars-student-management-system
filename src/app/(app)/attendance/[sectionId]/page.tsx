/**
 * Section Attendance Register Page (`ARCHITECTURE.md` §17–§18, `PRD.md` MODULE 17).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { CaretLeftIcon, ClockIcon } from "@/components/ui/icons";
import { db } from "@/db/client";
import { classes, groups, sections } from "@/db/schema";
import { listAcademicSessions, listTimeSlots } from "@/modules/academic";
import { getSectionAttendanceSheet } from "@/modules/attendance";
import { AttendanceSheet } from "@/modules/attendance/ui/attendance-sheet";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function SectionAttendancePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sectionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { sectionId } = await params;

  return (
    <InstitutionPage
      permission="attendance.view"
      title="Section Attendance Register"
      description="Record student attendance marks, submit completed registers, and review corrections."
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Attendance", href: "/attendance" },
        { label: "Register" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view or mark student attendance."
      empty={{
        chooseInstitution: "Choose an institution to view this attendance register.",
        noInstitution: "No institution available.",
        noMembership: "You are not a member of this institution.",
      }}
      actions={({ institution }) => (
        <Button
          variant="outline"
          size="sm"
          render={
            <Link
              href={
                institution
                  ? `/attendance?institution=${encodeURIComponent(institution.id)}`
                  : "/attendance"
              }
            />
          }
        >
          <CaretLeftIcon className="size-4 mr-1.5" />
          Back to Overview
        </Button>
      )}
      render={async ({ institution }) => {
        const queryParams = await searchParams;
        const requestedDate = typeof queryParams.date === "string" ? queryParams.date : undefined;
        const todayDate = requestedDate ?? new Date().toISOString().slice(0, 10);

        // Fetch section details
        const sectionRow = await db
          .select({
            id: sections.id,
            name: sections.name,
            groupId: sections.groupId,
            groupName: groups.name,
            classId: groups.classId,
            className: classes.name,
          })
          .from(sections)
          .innerJoin(groups, eq(sections.groupId, groups.id))
          .innerJoin(classes, eq(groups.classId, classes.id))
          .where(eq(sections.id, sectionId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!sectionRow) {
          notFound();
        }

        const [academicSessionsList, timeSlots] = await Promise.all([
          listAcademicSessions(institution.id),
          listTimeSlots(institution.id),
        ]);

        const currentAcademicSession =
          academicSessionsList.find((s) => s.isCurrent) ?? academicSessionsList[0];

        if (!currentAcademicSession) {
          return (
            <EmptyState
              title="No Academic Session"
              description="An academic session must be active to record student attendance."
            />
          );
        }

        if (timeSlots.length === 0) {
          return (
            <EmptyState
              icon={ClockIcon}
              title="No Time Slots Configured"
              description="Configure timetable time slots under Academics before taking attendance."
            />
          );
        }

        const requestedSlotId =
          typeof queryParams.timeSlotId === "string" ? queryParams.timeSlotId : undefined;
        const activeTimeSlot =
          timeSlots.find((slot) => slot.id === requestedSlotId) ?? timeSlots[0]!;

        const sheetView = await getSectionAttendanceSheet(
          sectionId,
          todayDate,
          activeTimeSlot.id,
        );

        return (
          <div className="space-y-6">
            {/* Header Context Banner */}
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-foreground">
                    {sectionRow.className} — Section {sectionRow.name}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Academic Group: {sectionRow.groupName} • Academic Session:{" "}
                    <strong>{currentAcademicSession.name}</strong>
                  </p>
                </div>

                {/* Time slot switch tabs */}
                {timeSlots.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Periods">
                    {timeSlots.map((slot) => {
                      const isSelected = slot.id === activeTimeSlot.id;
                      return (
                        <Link
                          key={slot.id}
                          href={`/attendance/${sectionId}?date=${todayDate}&timeSlotId=${slot.id}&institution=${encodeURIComponent(institution.id)}`}
                          className={`rounded px-2.5 py-1 text-xs font-medium border transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/40 hover:bg-muted text-foreground border-transparent"
                          }`}
                        >
                          {slot.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Attendance Register */}
            <AttendanceSheet
              institutionId={institution.id}
              sectionId={sectionId}
              academicSessionId={currentAcademicSession.id}
              attendanceDate={todayDate}
              timeSlotId={activeTimeSlot.id}
              initialSession={sheetView.session}
              initialRecords={sheetView.records}
              roster={sheetView.roster}
              corrections={sheetView.corrections}
            />
          </div>
        );
      }}
    />
  );
}
