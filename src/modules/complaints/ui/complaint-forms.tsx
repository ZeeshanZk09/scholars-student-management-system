"use client";

/**
 * Complaint UI components and form dialogs (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 *
 * Uses Base UI primitives via shared components and Phosphor Icons.
 * Strict type safety, plain English error messages, and zero DB jargon.
 */

import { CheckboxField } from "@/components/shared/checkbox-field";
import { EntityDialog } from "@/components/shared/entity-dialog";
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { TextareaField, TextField } from "@/components/shared/text-field";
import {
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_SEVERITY_TONES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_TONES,
  type ComplaintSeverity,
  type ComplaintStatus,
} from "../domain/complaint-rules";
import {
  addComplaintCommentAction,
  assignComplaintAction,
  dismissComplaintAction,
  escalateComplaintAction,
  notifyStudentOrGuardianAction,
  resolveComplaintAction,
  submitComplaintAction,
} from "./actions";

/* -------------------------------------------------------------------------- */
/* Badges                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_TONE_MAP: Record<
  "info" | "warning" | "success" | "neutral" | "danger",
  StatusTone
> = {
  info: "info",
  warning: "warning",
  success: "success",
  neutral: "neutral",
  danger: "danger",
};

export function ComplaintStatusBadge({
  status,
  className,
}: Readonly<{
  status: ComplaintStatus;
  className?: string;
}>) {
  const label = COMPLAINT_STATUS_LABELS[status] ?? status;
  const tone = STATUS_TONE_MAP[COMPLAINT_STATUS_TONES[status]] ?? "neutral";

  return (
    <StatusBadge tone={tone} {...(className ? { className } : {})}>
      {label}
    </StatusBadge>
  );
}

export function ComplaintSeverityBadge({
  severity,
  className,
}: Readonly<{
  severity: ComplaintSeverity;
  className?: string;
}>) {
  const label = COMPLAINT_SEVERITY_LABELS[severity] ?? severity;
  const tone = STATUS_TONE_MAP[COMPLAINT_SEVERITY_TONES[severity]] ?? "neutral";

  return (
    <StatusBadge tone={tone} {...(className ? { className } : {})}>
      {label}
    </StatusBadge>
  );
}

/* -------------------------------------------------------------------------- */
/* Options Constants                                                          */
/* -------------------------------------------------------------------------- */

export const SEVERITY_OPTIONS: readonly SelectOption[] = COMPLAINT_SEVERITIES.map((s) => ({
  value: s,
  label: COMPLAINT_SEVERITY_LABELS[s],
}));

export const REASON_SUGGESTIONS: readonly SelectOption[] = [
  { value: "Classroom Disruption", label: "Classroom Disruption" },
  { value: "Attendance & Punctuality", label: "Attendance & Punctuality" },
  { value: "Academic Dishonesty", label: "Academic Dishonesty" },
  { value: "Physical Altercation", label: "Physical Altercation" },
  { value: "Verbal Misconduct", label: "Verbal Misconduct" },
  { value: "Bullying & Harassment", label: "Bullying & Harassment" },
  { value: "Property Damage", label: "Property Damage" },
  { value: "Dress Code & Uniform", label: "Dress Code & Uniform" },
  { value: "Electronic Device Policy", label: "Electronic Device Policy" },
  { value: "Other Misconduct", label: "Other Misconduct" },
];

export const NOTIFICATION_CHANNELS: readonly SelectOption[] = [
  { value: "both", label: "Both Student & Guardian" },
  { value: "student", label: "Student Only" },
  { value: "guardian", label: "Parent / Guardian Only" },
];

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

export function CreateComplaintDialog({
  institutionId,
  academicSessionId,
  students,
  classes = [],
  subjects = [],
  triggerLabel = "Lodge Complaint",
}: Readonly<{
  institutionId: string;
  academicSessionId: string;
  students: readonly { readonly id: string; readonly name: string }[];
  classes?: readonly { readonly id: string; readonly name: string }[] | undefined;
  subjects?: readonly { readonly id: string; readonly name: string }[] | undefined;
  triggerLabel?: string | undefined;
}>) {
  const studentOptions: readonly SelectOption[] = students.map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const classOptions: readonly SelectOption[] = classes.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const subjectOptions: readonly SelectOption[] = subjects.map((sub) => ({
    value: sub.id,
    label: sub.name,
  }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <EntityDialog
      triggerLabel={triggerLabel}
      title="Lodge Student Incident / Complaint"
      description="Record a teacher report regarding student behavior or academic misconduct."
      action={submitComplaintAction}
      submitLabel="Submit Complaint"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="academicSessionId" value={academicSessionId} />

      <SelectField
        id="studentId"
        label="Student"
        options={studentOptions}
        placeholder="Select student"
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="reportedDate"
          label="Date of Incident"
          type="date"
          defaultValue={today}
          required
        />
        <SelectField
          id="severity"
          label="Severity Level"
          options={SEVERITY_OPTIONS}
          defaultValue="medium"
          required
        />
      </div>

      <TextField
        id="title"
        label="Incident Title"
        placeholder="Brief summary of what happened"
        required
      />

      <SelectField
        id="reason"
        label="Reason / Category"
        options={REASON_SUGGESTIONS}
        placeholder="Select category"
        required
      />

      {classOptions.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            id="classId"
            label="Class Context (Optional)"
            options={classOptions}
            placeholder="Select class"
          />
          {subjectOptions.length > 0 && (
            <SelectField
              id="subjectId"
              label="Subject Context (Optional)"
              options={subjectOptions}
              placeholder="Select subject"
            />
          )}
        </div>
      )}

      <TextareaField
        id="description"
        label="Detailed Narrative"
        placeholder="Provide an objective, factual description of the incident..."
        required
        rows={4}
      />
    </EntityDialog>
  );
}

export function AssignComplaintDialog({
  institutionId,
  complaintId,
  investigators,
  currentAssigneeId,
  triggerLabel = "Assign Investigator",
}: Readonly<{
  institutionId: string;
  complaintId: string;
  investigators: readonly { readonly id: string; readonly name: string }[];
  currentAssigneeId?: string | null | undefined;
  triggerLabel?: string | undefined;
}>) {
  const investigatorOptions: readonly SelectOption[] = investigators.map((inv) => ({
    value: inv.id,
    label: inv.name,
  }));

  return (
    <EntityDialog
      triggerLabel={triggerLabel}
      title="Assign Complaint Investigator"
      description="Designate a staff member or coordinator to investigate and resolve this matter."
      action={assignComplaintAction}
      submitLabel="Confirm Assignment"
      triggerVariant="outline"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="complaintId" value={complaintId} />

      <SelectField
        id="assignedToUserId"
        label="Investigator / Staff Member"
        options={investigatorOptions}
        defaultValue={currentAssigneeId ?? undefined}
        placeholder="Select staff member"
        required
      />
    </EntityDialog>
  );
}

export function ResolveComplaintDialog({
  institutionId,
  complaintId,
  triggerLabel = "Resolve Complaint",
}: Readonly<{
  institutionId: string;
  complaintId: string;
  triggerLabel?: string | undefined;
}>) {
  return (
    <EntityDialog
      triggerLabel={triggerLabel}
      title="Record Resolution"
      description="Document the corrective action or disciplinary measure taken to conclude this complaint."
      action={resolveComplaintAction}
      submitLabel="Mark as Resolved"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="complaintId" value={complaintId} />

      <TextareaField
        id="actionTaken"
        label="Action Taken"
        placeholder="Describe steps taken (e.g., student apologized, detention served, parent conference held)..."
        required
        rows={3}
      />

      <TextareaField
        id="details"
        label="Additional Resolution Notes (Optional)"
        placeholder="Any long-term behavioral agreements or followup requirements..."
        rows={2}
      />
    </EntityDialog>
  );
}

export function DismissComplaintDialog({
  institutionId,
  complaintId,
  triggerLabel = "Dismiss Complaint",
}: Readonly<{
  institutionId: string;
  complaintId: string;
  triggerLabel?: string | undefined;
}>) {
  return (
    <EntityDialog
      triggerLabel={triggerLabel}
      title="Dismiss Complaint"
      description="Dismiss this complaint if it was unfounded, resolved informally, or filed in error."
      action={dismissComplaintAction}
      submitLabel="Confirm Dismissal"
      triggerVariant="outline"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="complaintId" value={complaintId} />

      <TextareaField
        id="dismissalReason"
        label="Reason for Dismissal"
        placeholder="Explain why no further disciplinary action is needed..."
        required
        rows={3}
      />
    </EntityDialog>
  );
}

export function EscalateComplaintDialog({
  institutionId,
  complaintId,
  leaders = [],
  triggerLabel = "Escalate to Leadership",
}: Readonly<{
  institutionId: string;
  complaintId: string;
  leaders?: readonly { readonly id: string; readonly name: string }[] | undefined;
  triggerLabel?: string | undefined;
}>) {
  const leaderOptions: readonly SelectOption[] = leaders.map((l) => ({
    value: l.id,
    label: l.name,
  }));

  return (
    <EntityDialog
      triggerLabel={triggerLabel}
      title="Escalate Complaint"
      description="Escalate this severe or critical incident to senior school administration."
      action={escalateComplaintAction}
      submitLabel="Escalate Immediately"
      triggerVariant="destructive"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="complaintId" value={complaintId} />

      <TextareaField
        id="reason"
        label="Escalation Justification"
        placeholder="Detail why standard resolution was insufficient or why urgent leadership intervention is required..."
        required
        rows={3}
      />

      {leaderOptions.length > 0 && (
        <SelectField
          id="targetAssigneeId"
          label="Direct Escalation Target (Optional)"
          options={leaderOptions}
          placeholder="Select administrator or principal"
        />
      )}
    </EntityDialog>
  );
}

export function NotifyStudentOrGuardianDialog({
  institutionId,
  complaintId,
  triggerLabel = "Send Notification",
}: Readonly<{
  institutionId: string;
  complaintId: string;
  triggerLabel?: string | undefined;
}>) {
  return (
    <EntityDialog
      triggerLabel={triggerLabel}
      title="Notify Family"
      description="Send in-app or formal notification regarding this complaint."
      action={notifyStudentOrGuardianAction}
      submitLabel="Send Notification"
      triggerVariant="outline"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="complaintId" value={complaintId} />

      <SelectField
        id="channel"
        label="Recipients"
        options={NOTIFICATION_CHANNELS}
        defaultValue="both"
        required
      />
    </EntityDialog>
  );
}

export function AddComplaintCommentDialog({
  institutionId,
  complaintId,
  isStaff = true,
  triggerLabel = "Add Note / Feedback",
}: Readonly<{
  institutionId: string;
  complaintId: string;
  isStaff?: boolean | undefined;
  triggerLabel?: string | undefined;
}>) {
  return (
    <EntityDialog
      triggerLabel={triggerLabel}
      title={isStaff ? "Add Note or Investigation Update" : "Submit Student / Parent Feedback"}
      description={
        isStaff
          ? "Add an entry to the complaint log. Check internal note to hide from family view."
          : "Provide feedback or response regarding this complaint record."
      }
      action={addComplaintCommentAction}
      submitLabel="Post Message"
      triggerVariant="outline"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="complaintId" value={complaintId} />

      <TextareaField
        id="body"
        label="Message Content"
        placeholder="Type note or response details..."
        required
        rows={3}
      />

      {isStaff && (
        <CheckboxField
          id="isInternal"
          label="Internal Staff Note (Confidential, hidden from student & guardians)"
          defaultChecked={false}
        />
      )}
    </EntityDialog>
  );
}
