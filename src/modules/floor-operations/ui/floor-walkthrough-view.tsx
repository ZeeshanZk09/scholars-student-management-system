"use client";

/**
 * Floor Walk-Through Inspection View (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 *
 * Tablet-optimised live inspection dashboard for Floor Incharge supervisors.
 * Shows classroom occupancy, timetabled vs present teachers, attendance status,
 * and quick actions for logging incidents or substitutions.
 */

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChalkboardTeacherIcon,
  CheckCircleIcon,
  ClockIcon,
  SwapIcon,
  UsersIcon,
  WarningCircleIcon,
} from "@/components/ui/icons";
import type { FloorLiveSnapshotStatus } from "../domain/floor-rules";
import type { FloorRoomWalkthroughItem } from "../application/ports";
import { captureLiveSnapshotAction, createIncidentReportAction } from "./actions";

interface FloorWalkthroughViewProps {
  readonly institutionId: string;
  readonly floorId: string;
  readonly floorName: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly timeSlotName: string;
  readonly items: readonly FloorRoomWalkthroughItem[];
}

export function FloorWalkthroughView({
  institutionId,
  floorId,
  floorName,
  attendanceDate,
  timeSlotId,
  timeSlotName,
  items,
}: FloorWalkthroughViewProps) {
  const [selectedItem, setSelectedItem] = React.useState<FloorRoomWalkthroughItem | null>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = React.useState(false);
  const [incidentDescription, setIncidentDescription] = React.useState("");
  const [incidentSeverity, setIncidentSeverity] = React.useState<"low" | "medium" | "high" | "critical">("medium");
  const [incidentKind, setIncidentKind] = React.useState<
    "behaviour" | "injury" | "absence" | "device_failure" | "security" | "other"
  >("behaviour");
  const [submittingIncident, setSubmittingIncident] = React.useState(false);

  // Counters
  const totalRooms = items.length;
  const onScheduleCount = items.filter((i) => i.status === "as_scheduled").length;
  const substituteCount = items.filter((i) => i.status === "substitute").length;
  const unmarkedCount = items.filter((i) => i.status === "unmarked").length;
  const totalIncidents = items.reduce((acc, curr) => acc + curr.openIncidentsCount, 0);

  const getStatusBadge = (status: FloorLiveSnapshotStatus) => {
    switch (status) {
      case "as_scheduled":
        return (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <CheckCircleIcon className="mr-1 inline h-3.5 w-3.5" />
            On Schedule
          </Badge>
        );
      case "substitute":
        return (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <SwapIcon className="mr-1 inline h-3.5 w-3.5" />
            Substitute Assigned
          </Badge>
        );
      case "free":
        return (
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400">
            Free Period
          </Badge>
        );
      case "unmarked":
        return (
          <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400">
            <ClockIcon className="mr-1 inline h-3.5 w-3.5" />
            Attendance Pending
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
            Cancelled
          </Badge>
        );
    }
  };

  const handleQuickMarkSnapshot = async (
    item: FloorRoomWalkthroughItem,
    newStatus: FloorLiveSnapshotStatus,
  ) => {
    const formData = new FormData();
    formData.append("institutionId", institutionId);
    formData.append("floorId", floorId);
    formData.append("scheduleId", item.scheduleId);
    formData.append("attendanceDate", attendanceDate);
    formData.append("timeSlotId", timeSlotId);
    if (item.sectionId) formData.append("sectionId", item.sectionId);
    if (item.subjectId) formData.append("subjectId", item.subjectId);
    if (item.teacherId) formData.append("teacherId", item.teacherId);
    formData.append("status", newStatus);
    formData.append("attendanceSubmitted", item.attendanceSubmitted ? "true" : "false");

    const result = await captureLiveSnapshotAction({ status: "idle" }, formData);
    if (result.status === "done") {
      toast.success(result.message);
    } else if (result.status === "error") {
      toast.error(result.message);
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    setSubmittingIncident(true);
    try {
      const formData = new FormData();
      formData.append("institutionId", institutionId);
      formData.append("floorId", floorId);
      if (selectedItem.sectionId) formData.append("sectionId", selectedItem.sectionId);
      formData.append("severity", incidentSeverity);
      formData.append("kind", incidentKind);
      formData.append("description", incidentDescription);

      const result = await createIncidentReportAction({ status: "idle" }, formData);
      if (result.status === "done") {
        toast.success(result.message);
        setIncidentDialogOpen(false);
        setIncidentDescription("");
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    } finally {
      setSubmittingIncident(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Context */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Floor Supervision: {floorName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {timeSlotName} • Date: {attendanceDate}
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Rooms Checked</div>
          <div className="mt-1 text-2xl font-bold">{totalRooms}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">On Schedule</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {onScheduleCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Substitutions</div>
          <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {substituteCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Attendance Pending</div>
          <div className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">
            {unmarkedCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Open Incidents</div>
          <div className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {totalIncidents}
          </div>
        </Card>
      </div>

      {/* Room Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card
            key={item.scheduleId}
            className="flex flex-col justify-between p-5 transition-shadow hover:shadow-md"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {item.className ? `${item.className} - ${item.sectionName}` : item.sectionName ?? "Classroom"}
                  </h2>
                  <p className="text-sm font-medium text-muted-foreground">
                    {item.subjectName ?? "Free Period"}
                  </p>
                </div>
                <div>{getStatusBadge(item.status)}</div>
              </div>

              {/* Teacher Info */}
              <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex items-center gap-2 text-foreground">
                  <ChalkboardTeacherIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {item.substituteTeacherName ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {item.substituteTeacherName} (Substitute)
                      </span>
                    ) : (
                      item.teacherName ?? "No Teacher Assigned"
                    )}
                  </span>
                </div>
                {item.substituteTeacherName && item.teacherName && (
                  <p className="text-xs text-muted-foreground">
                    Regular: {item.teacherName} (Absent)
                  </p>
                )}
              </div>

              {/* Attendance Status */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <UsersIcon className="h-3.5 w-3.5" />
                  <span>
                    {item.attendanceSubmitted ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Attendance Marked ({item.markedCount}/{item.totalStudents ?? "?"})
                      </span>
                    ) : (
                      <span className="text-orange-700 dark:text-orange-400">
                        Attendance Not Yet Submitted
                      </span>
                    )}
                  </span>
                </div>
                {item.openIncidentsCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    <WarningCircleIcon className="mr-1 h-3 w-3" />
                    {item.openIncidentsCount} {item.openIncidentsCount === 1 ? "Incident" : "Incidents"}
                  </Badge>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-4 flex items-center justify-between border-t pt-3">
              <div className="flex items-center gap-1.5">
                {item.status !== "as_scheduled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => handleQuickMarkSnapshot(item, "as_scheduled")}
                  >
                    Confirm Normal
                  </Button>
                )}
                {item.status !== "free" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => handleQuickMarkSnapshot(item, "free")}
                  >
                    Mark Free
                  </Button>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-rose-600 dark:text-rose-400"
                onClick={() => {
                  setSelectedItem(item);
                  setIncidentDialogOpen(true);
                }}
              >
                Log Incident
              </Button>
            </div>
          </Card>
        ))}

        {items.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed p-12 text-center text-muted-foreground">
            <p className="text-base font-medium">No scheduled periods for this floor and time slot.</p>
            <p className="mt-1 text-sm">Select another floor or period above to view live operations.</p>
          </div>
        )}
      </div>

      {/* Incident Report Modal */}
      {incidentDialogOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">
              Report Floor Incident
            </h3>
            <p className="text-sm text-muted-foreground">
              Room: {selectedItem.className ? `${selectedItem.className} - ${selectedItem.sectionName}` : selectedItem.sectionName ?? "Classroom"}
            </p>

            <form onSubmit={handleCreateIncident} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground">Incident Severity</label>
                <select
                  value={incidentSeverity}
                  onChange={(e) => setIncidentSeverity(e.target.value as "low" | "medium" | "high" | "critical")}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="low">Low (Minor distraction or issue)</option>
                  <option value="medium">Medium (Requires teacher attention)</option>
                  <option value="high">High (Requires floor supervisor intervention)</option>
                  <option value="critical">Critical (Immediate safety or security concern)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Incident Category</label>
                <select
                  value={incidentKind}
                  onChange={(e) =>
                    setIncidentKind(
                      e.target.value as "behaviour" | "injury" | "absence" | "device_failure" | "security" | "other",
                    )
                  }
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="behaviour">Student Behaviour</option>
                  <option value="injury">Injury or Medical</option>
                  <option value="absence">Teacher / Student Absence</option>
                  <option value="device_failure">Facility or Equipment Failure</option>
                  <option value="security">Security Concern</option>
                  <option value="other">Other Incident</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Description of Event</label>
                <textarea
                  required
                  rows={3}
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  placeholder="Explain what happened and current situation..."
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIncidentDialogOpen(false)}
                  disabled={submittingIncident}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  disabled={submittingIncident || incidentDescription.trim().length < 3}
                >
                  {submittingIncident ? "Saving..." : "Submit Incident Report"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
