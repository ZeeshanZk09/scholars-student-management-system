"use client";

/**
 * Interactive attendance register sheet designed for non-technical educators and staff.
 * Features 1-click status selection, mark-all-present, live counters, and audited correction workflow.
 */
import * as React from "react";
import { toast } from "sonner";

import { EntityDialog } from "@/components/shared/entity-dialog";
import { SelectField } from "@/components/shared/select-field";
import { TextField } from "@/components/shared/text-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarBlankIcon,
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  WarningCircleIcon,
  XIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import type { AttendanceStatus } from "../domain/attendance-rules";
import type {
  AttendanceCorrectionRow,
  AttendanceRecordRow,
  AttendanceSessionRow,
  StudentSectionRosterItem,
} from "../application/ports";
import {
  recordAttendanceCorrectionAction,
  saveAttendanceMarksDirectAction,
} from "./actions";

interface MarkState {
  readonly status: AttendanceStatus;
  readonly minutesLate?: number | undefined;
}

interface AttendanceSheetProps {
  readonly institutionId: string;
  readonly sectionId: string;
  readonly academicSessionId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly scheduleId?: string | null;
  readonly initialSession: AttendanceSessionRow | null;
  readonly initialRecords: readonly AttendanceRecordRow[];
  readonly roster: readonly StudentSectionRosterItem[];
  readonly corrections: readonly AttendanceCorrectionRow[];
}

export function AttendanceSheet({
  institutionId,
  sectionId,
  academicSessionId,
  attendanceDate,
  timeSlotId,
  scheduleId,
  initialSession,
  initialRecords,
  roster,
  corrections,
}: Readonly<AttendanceSheetProps>) {
  const isSubmitted = initialSession?.status === "submitted";

  // Build initial marks map
  const [marks, setMarks] = React.useState<Map<string, MarkState>>(() => {
    const map = new Map<string, MarkState>();
    for (const record of initialRecords) {
      map.set(record.studentId, {
        status: record.status,
        minutesLate: record.minutesLate ?? undefined,
      });
    }
    // If brand new sheet, default all students to present for frictionless fast roll-call
    if (initialRecords.length === 0) {
      for (const student of roster) {
        map.set(student.studentId, { status: "present" });
      }
    }
    return map;
  });

  const [query, setQuery] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // Status counts
  const counts = React.useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let unmarked = 0;

    for (const student of roster) {
      const mark = marks.get(student.studentId);
      if (!mark) {
        unmarked++;
      } else if (mark.status === "present") {
        present++;
      } else if (mark.status === "absent") {
        absent++;
      } else if (mark.status === "late") {
        late++;
      } else if (mark.status === "leave") {
        leave++;
      }
    }

    return { present, absent, late, leave, unmarked, total: roster.length };
  }, [marks, roster]);

  const filteredRoster = React.useMemo(() => {
    if (!query.trim()) return roster;
    const q = query.toLowerCase();
    return roster.filter((s) => {
      const name = `${s.firstName} ${s.lastName ?? ""}`.toLowerCase();
      const roll = (s.rollNumber ?? "").toLowerCase();
      return name.includes(q) || roll.includes(q);
    });
  }, [query, roster]);

  const setStudentStatus = (studentId: string, status: AttendanceStatus, minutesLate?: number) => {
    if (isSubmitted) return;
    setMarks((prev) => {
      const next = new Map(prev);
      next.set(studentId, {
        status,
        minutesLate: status === "late" ? (minutesLate ?? 15) : undefined,
      });
      return next;
    });
  };

  const handleMarkAllPresent = () => {
    if (isSubmitted) return;
    setMarks((prev) => {
      const next = new Map(prev);
      for (const student of roster) {
        next.set(student.studentId, { status: "present" });
      }
      return next;
    });
    toast.success("All enrolled students marked Present.");
  };

  const handleSave = async (submitFinal: boolean) => {
    if (roster.length === 0) {
      toast.error("No enrolled students in this section to record attendance for.");
      return;
    }

    const payloadMarks = Array.from(marks.entries()).map(([studentId, data]) => ({
      studentId,
      status: data.status,
      minutesLate: data.status === "late" ? (data.minutesLate ?? 15) : null,
    }));

    setIsSaving(true);
    try {
      const res = await saveAttendanceMarksDirectAction({
        institutionId,
        sectionId,
        academicSessionId,
        attendanceDate,
        timeSlotId,
        scheduleId: scheduleId ?? null,
        marks: payloadMarks,
        isSubmitting: submitFinal,
      });

      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Network or unexpected error while saving attendance.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Session State Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Period Attendance Register</h2>
            <Badge variant={isSubmitted ? "default" : "secondary"}>
              {isSubmitted ? "Finalized & Submitted" : "In Progress (Draft)"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CalendarBlankIcon className="size-4" />
            <span>Date: {attendanceDate}</span>
            <span>•</span>
            <UsersIcon className="size-4" />
            <span>Total Enrolled: {roster.length}</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!isSubmitted && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMarkAllPresent}
                disabled={isSaving || roster.length === 0}
              >
                <CheckCircleIcon className="size-4 mr-1.5 text-emerald-600" />
                Mark All Present
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSave(false)}
                disabled={isSaving || roster.length === 0}
              >
                Save Draft
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => handleSave(true)}
                disabled={isSaving || counts.unmarked > 0 || roster.length === 0}
              >
                Finalize & Submit
              </Button>
            </>
          )}
          {isSubmitted && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Published: To change any recorded mark, select &quot;Record Correction&quot; on the student&apos;s row.
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-xs font-medium text-muted-foreground">Present</div>
          <div className="text-2xl font-bold text-emerald-600">{counts.present}</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-xs font-medium text-muted-foreground">Absent</div>
          <div className="text-2xl font-bold text-rose-600">{counts.absent}</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-xs font-medium text-muted-foreground">Late</div>
          <div className="text-2xl font-bold text-amber-600">{counts.late}</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-xs font-medium text-muted-foreground">Leave</div>
          <div className="text-2xl font-bold text-blue-600">{counts.leave}</div>
        </div>
        <div className="col-span-2 rounded-lg border bg-card p-3 text-center sm:col-span-1">
          <div className="text-xs font-medium text-muted-foreground">Unmarked</div>
          <div className={`text-2xl font-bold ${counts.unmarked > 0 ? "text-rose-500" : "text-muted-foreground"}`}>
            {counts.unmarked}
          </div>
        </div>
      </div>

      {/* Roster Search Bar */}
      <div className="relative max-w-sm">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by student name or roll number..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          aria-label="Filter students by name or roll number"
        />
      </div>

      {/* Student Roster Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" role="table" aria-label="Student Attendance Roster">
            <thead className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 w-16">Roll</th>
                <th scope="col" className="px-4 py-3">Student Name</th>
                <th scope="col" className="px-4 py-3">Attendance Mark</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    {roster.length === 0
                      ? "No students are currently placed in this section."
                      : "No students match your search filter."}
                  </td>
                </tr>
              ) : (
                filteredRoster.map((student) => {
                  const currentMark = marks.get(student.studentId);
                  const status = currentMark?.status;
                  const fullName = `${student.firstName} ${student.lastName ?? ""}`.trim();
                  const studentCorrections = corrections.filter((c) => c.studentId === student.studentId);

                  return (
                    <tr key={student.studentId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-medium text-muted-foreground">
                        {student.rollNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{fullName}</div>
                        {studentCorrections.length > 0 && (
                          <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                            <WarningCircleIcon className="size-3" />
                            <span>Corrected from {studentCorrections[0]?.beforeStatus}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSubmitted ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                status === "present"
                                  ? "default"
                                  : status === "absent"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {status ? status.toUpperCase() : "UNMARKED"}
                            </Badge>
                            {status === "late" && currentMark?.minutesLate && (
                              <span className="text-xs text-muted-foreground">
                                ({currentMark.minutesLate}m late)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Status for ${fullName}`}>
                            <button
                              type="button"
                              onClick={() => setStudentStatus(student.studentId, "present")}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                                status === "present"
                                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                  : "border-muted-foreground/30 hover:bg-emerald-50 text-foreground dark:hover:bg-emerald-950/40"
                              }`}
                              aria-pressed={status === "present"}
                            >
                              <CheckCircleIcon className="size-3.5" />
                              Present
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudentStatus(student.studentId, "absent")}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                                status === "absent"
                                  ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                  : "border-muted-foreground/30 hover:bg-rose-50 text-foreground dark:hover:bg-rose-950/40"
                              }`}
                              aria-pressed={status === "absent"}
                            >
                              <XIcon className="size-3.5" />
                              Absent
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudentStatus(student.studentId, "late", 15)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                                status === "late"
                                  ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                                  : "border-muted-foreground/30 hover:bg-amber-50 text-foreground dark:hover:bg-amber-950/40"
                              }`}
                              aria-pressed={status === "late"}
                            >
                              <ClockIcon className="size-3.5" />
                              Late
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isSubmitted ? (
                          <EntityDialog
                            triggerLabel="Correct Mark"
                            triggerVariant="outline"
                            title="Record Attendance Correction"
                            description={`Submit an audited post-publication correction for ${fullName}.`}
                            action={recordAttendanceCorrectionAction}
                            submitLabel="Submit Correction"
                            width="md"
                          >
                            <input type="hidden" name="institutionId" value={institutionId} />
                            <input type="hidden" name="sectionId" value={sectionId} />
                            <input type="hidden" name="attendanceDate" value={attendanceDate} />
                            <input type="hidden" name="timeSlotId" value={timeSlotId} />
                            <input type="hidden" name="studentId" value={student.studentId} />

                            <div className="space-y-4 py-2 text-left">
                              <div className="rounded bg-muted p-2.5 text-xs text-muted-foreground">
                                Current Recorded Mark:{" "}
                                <strong className="text-foreground">
                                  {status ? status.toUpperCase() : "UNKNOWN"}
                                </strong>
                              </div>

                              <SelectField
                                id={`afterStatus-${student.studentId}`}
                                name="afterStatus"
                                label="New Correct Status"
                                options={[
                                  { value: "present", label: "Present" },
                                  { value: "absent", label: "Absent" },
                                  { value: "late", label: "Late" },
                                  { value: "leave", label: "Approved Leave" },
                                ]}
                                required
                              />

                              <TextField
                                id={`reason-${student.studentId}`}
                                name="reason"
                                label="Reason for Correction"
                                placeholder="e.g. Student reported to health room during roll call, verified present by nurse."
                                required
                              />
                            </div>
                          </EntityDialog>
                        ) : (
                          status === "late" && (
                            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <span>Mins:</span>
                              <input
                                type="number"
                                min="1"
                                max="180"
                                value={currentMark?.minutesLate ?? 15}
                                onChange={(e) =>
                                  setStudentStatus(student.studentId, "late", parseInt(e.target.value, 10) || 1)
                                }
                                className="w-14 rounded border px-1.5 py-0.5 text-center text-xs"
                                aria-label={`Minutes late for ${fullName}`}
                              />
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
