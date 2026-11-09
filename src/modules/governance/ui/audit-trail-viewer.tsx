"use client";

/**
 * Immutable Audit Trail Viewer UI (`PRD.md` MODULE 31, `ARCHITECTURE.md` §30).
 *
 * Provides compliance officers and administrators with a human-readable, searchable audit log.
 * Shows what happened, who acted, previous vs new states, without technical jargon or UUID exposure.
 */

import * as React from "react";
import {
  EyeIcon,
  FunnelIcon,
  ScrollIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  formatAuditActionLabel,
  formatAuditDescription,
  type AuditRecord,
  type AuditResult,
} from "../domain/audit-trail";

export interface AuditTrailViewerProps {
  readonly initialRecords: readonly AuditRecord[];
  readonly totalRecords: number;
}

export function AuditTrailViewer({
  initialRecords,
  totalRecords,
}: Readonly<AuditTrailViewerProps>) {
  const [selectedEvent, setSelectedEvent] = React.useState<AuditRecord | null>(null);
  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [resultFilter, setResultFilter] = React.useState<string>("all");

  const filtered = initialRecords.filter((record) => {
    if (actionFilter !== "all" && !record.action.startsWith(actionFilter)) {
      return false;
    }
    if (resultFilter !== "all" && record.result !== resultFilter) {
      return false;
    }
    return true;
  });

  const getResultTone = (result: AuditResult): StatusTone => {
    switch (result) {
      case "success":
        return "success";
      case "denied":
        return "danger";
      case "failure":
        return "warning";
      default:
        return "neutral";
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Immutability Assurance Banner */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs">
        <ShieldCheckIcon className="size-5 shrink-0 text-primary" weight="bold" />
        <div>
          <span className="font-semibold text-foreground">Immutable Audit Trail</span>
          <p className="mt-0.5 text-muted-foreground">
            All system operations, financial adjustments, attendance entries, and configuration
            modifications are permanently recorded and tamper-resistant.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FunnelIcon className="size-3.5" />
            <span>Filter:</span>
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1"
          >
            <option value="all">All Operations</option>
            <option value="attendance">Attendance Operations</option>
            <option value="fee">Fee & Financial Adjustments</option>
            <option value="salary">Payroll & Salaries</option>
            <option value="result">Exam Results & Marks</option>
            <option value="configuration">System Settings</option>
            <option value="auth">Authentication & Sign-in</option>
            <option value="user">User & Permission Changes</option>
            <option value="student">Student Records</option>
          </select>

          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1"
          >
            <option value="all">All Outcomes</option>
            <option value="success">Success Only</option>
            <option value="failure">Failures</option>
            <option value="denied">Access Denied</option>
          </select>
        </div>

        <div className="text-xs text-muted-foreground">
          Showing {filtered.length} of {totalRecords} logged events
        </div>
      </div>

      {/* Audit Log Table / Feed */}
      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-xs text-muted-foreground">
            <ScrollIcon className="mx-auto mb-2 size-8 text-muted-foreground/60" />
            <p>No audit trail records found matching the selected filters.</p>
          </div>
        ) : (
          filtered.map((record) => {
            const date = new Date(record.occurredAt);
            const description = formatAuditDescription({
              action: record.action,
              targetType: record.targetType,
              targetId: record.targetId,
              beforeState: record.beforeState,
              afterState: record.afterState,
              context: record.context,
            });

            return (
              <Card
                key={record.id}
                className="transition-colors hover:bg-muted/10 cursor-pointer"
                onClick={() => setSelectedEvent(record)}
              >
                <CardContent className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-xs text-foreground">
                        {formatAuditActionLabel(record.action)}
                      </span>
                      <StatusBadge tone={getResultTone(record.result)} dot={false}>
                        {record.result}
                      </StatusBadge>
                      <span className="text-[11px] text-muted-foreground">
                        Actor: <strong className="text-foreground">{record.actorDisplayName}</strong>
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-[11px] text-muted-foreground">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(record);
                      }}
                    >
                      <EyeIcon className="size-3.5" />
                      Inspect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Detail Inspection Modal */}
      {selectedEvent && (
        <Dialog open={true} onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <StatusBadge tone={getResultTone(selectedEvent.result)}>
                  {selectedEvent.result}
                </StatusBadge>
                <DialogTitle className="text-sm">
                  {formatAuditActionLabel(selectedEvent.action)}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                Permanent audit log entry recorded at{" "}
                {new Date(selectedEvent.occurredAt).toLocaleString()}.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col gap-4 text-xs">
              {/* Event Summary Overview */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
                <div>
                  <span className="text-[11px] text-muted-foreground">Performed By</span>
                  <p className="font-medium text-foreground">{selectedEvent.actorDisplayName}</p>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">Target Entity</span>
                  <p className="font-medium text-foreground">
                    {selectedEvent.targetType.replace(/_/g, " ")}
                  </p>
                </div>
                {selectedEvent.correlationId && (
                  <div>
                    <span className="text-[11px] text-muted-foreground">Correlation Reference</span>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {selectedEvent.correlationId}
                    </p>
                  </div>
                )}
                {selectedEvent.ipAddress && (
                  <div>
                    <span className="text-[11px] text-muted-foreground">IP Address</span>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {selectedEvent.ipAddress}
                    </p>
                  </div>
                )}
              </div>

              {/* State Transition Diff */}
              {(selectedEvent.beforeState || selectedEvent.afterState) && (
                <div className="flex flex-col gap-2">
                  <h4 className="font-medium text-xs text-foreground">State Changes</h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background p-3">
                      <span className="font-medium text-[11px] text-muted-foreground">
                        Previous Value
                      </span>
                      <pre className="mt-1.5 max-h-36 overflow-auto font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
                        {selectedEvent.beforeState
                          ? JSON.stringify(selectedEvent.beforeState, null, 2)
                          : "(No previous state recorded)"}
                      </pre>
                    </div>

                    <div className="rounded-lg border bg-background p-3">
                      <span className="font-medium text-[11px] text-foreground">
                        Updated Value
                      </span>
                      <pre className="mt-1.5 max-h-36 overflow-auto font-mono text-[11px] text-foreground whitespace-pre-wrap">
                        {selectedEvent.afterState
                          ? JSON.stringify(selectedEvent.afterState, null, 2)
                          : "(No new state recorded)"}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Context and Reasons */}
              {selectedEvent.context && (
                <div className="rounded-lg border bg-muted/10 p-3">
                  <span className="font-medium text-[11px] text-muted-foreground">
                    Additional Context / Business Reason
                  </span>
                  <pre className="mt-1 font-mono text-[11px] text-foreground whitespace-pre-wrap">
                    {JSON.stringify(selectedEvent.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
