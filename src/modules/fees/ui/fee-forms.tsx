"use client";

/**
 * Fee form controls (PRD MODULE 6 UI).
 *
 * The same pattern the admission module settled on (`admission-forms.tsx`), matched to what
 * each command *is*:
 *
 * - **Structures** are ordinary create/edit forms → `EntityDialog`, with one addition the
 *   others do not need: a repeatable items editor. A structure is a header plus 1..n fee heads,
 *   so the dialog carries React state for the rows (add / remove) while every row still posts
 *   plain `FormData` — repeated `itemName` / `itemAmount` / … parts the server action zips by
 *   index, and one `itemIsMandatory-{index}` checkbox per row (an unchecked box sends nothing,
 *   so a shared name could never be zipped back to its row).
 * - **Scope** is a dependent field: `appliesTo` decides *which* id the structure must carry, so
 *   the dialog shows exactly that one TextField and the boundary schema never has to scold a
 *   "class" structure for naming a group.
 * - **Payments, concessions, deferrals and credit notes** are small consequential forms → one
 *   `EntityDialog` each, ids hidden, the service enforcing the hard rules (allocation may not
 *   exceed the payment, exactly one concession basis, approval needs notes) from its zod
 *   boundary. The UI restates those rules as hints so the failure is rare, not so it is silent.
 *
 * Values travel as plain `FormData`. Import rule (`index.ts` header): types come from the
 * barrel, but every value — labels, tuples — comes from `domain/fee-rules` or this module's
 * `form-options`, so this file never pulls the Drizzle store into the client bundle.
 */
import * as React from "react";

import { CheckboxField } from "@/components/shared/checkbox-field";
import { EntityDialog } from "@/components/shared/entity-dialog";
import { FormField, fieldAria } from "@/components/shared/form-field";
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { TextareaField, TextField } from "@/components/shared/text-field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FeeStructureDetailRow, FeeStructureItemRow } from "@/modules/fees";

import {
  createFeeCreditNoteAction,
  createFeeStructureAction,
  decideFeeDeferralAction,
  generateInvoicesAction,
  grantFeeConcessionAction,
  recordFeePaymentAction,
  requestFeeDeferralAction,
  updateFeeStructureAction,
} from "./actions";
import {
  APPLIES_TO_OPTIONS,
  CONCESSION_KIND_OPTIONS,
  FEE_CATEGORY_OPTIONS,
  FEE_FREQUENCY_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
} from "./form-options";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

/** A `Select` whose value the component owns — needed when one field's visibility depends on it. */
function ControlledSelect({
  id,
  name,
  label,
  options,
  value,
  onValueChange,
  placeholder,
  required,
}: Readonly<{
  id: string;
  name: string;
  label: string;
  options: readonly SelectOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string | undefined;
  required?: boolean | undefined;
}>) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label])) as Record<
    string,
    string
  >;

  return (
    <FormField label={label} htmlFor={id} required={required ?? false}>
      <Select
        name={name}
        items={items}
        value={value}
        onValueChange={onValueChange}
        required={required ?? false}
      >
        <SelectTrigger id={id} className="w-full" {...fieldAria(id, {})}>
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

/** Today as `YYYY-MM-DD` — the default for "received on" / "due on" pickers. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/* -------------------------------------------------------------------------- */
/* Fee-structure items editor                                                  */
/* -------------------------------------------------------------------------- */

interface ItemFormRow {
  readonly key: number;
  readonly name: string;
  readonly amount: string;
  readonly discountAmount: string;
  readonly frequency: string;
  readonly installmentCount: string;
  readonly category: string;
  readonly description: string;
  readonly isMandatory: boolean;
}

function blankItem(key: number): ItemFormRow {
  return {
    key,
    name: "",
    amount: "",
    discountAmount: "",
    frequency: "one_time",
    installmentCount: "",
    category: "other",
    description: "",
    isMandatory: true,
  };
}

function itemToRow(item: FeeStructureItemRow, key: number): ItemFormRow {
  return {
    key,
    name: item.name,
    amount: item.amount,
    discountAmount: item.discountAmount ?? "",
    frequency: item.frequency,
    installmentCount: item.installmentCount === null ? "" : String(item.installmentCount),
    category: item.category,
    description: item.description ?? "",
    isMandatory: item.isMandatory,
  };
}

/**
 * The 1..n fee heads a structure bills. Rows live in React state (add / remove renumbers the
 * `itemIsMandatory-{index}` checkboxes; the text and select parts are repeated names zipped by
 * DOM order in the server action). Frequency drives whether installments are meaningful — the
 * boundary says a recurring item needs a count and a one-time item must not have one, so the
 * count field carries that hint rather than being hidden.
 */
function FeeItemsEditor({ initial }: { initial?: readonly FeeStructureItemRow[] | undefined }) {
  const [rows, setRows] = React.useState<readonly ItemFormRow[]>(() =>
    initial === undefined || initial.length === 0
      ? [blankItem(0)]
      : initial.map((item, index) => itemToRow(item, index)),
  );
  const sectionRef = React.useRef<HTMLElement>(null);

  function addRow(): void {
    setRows((current) => {
      const highest = current.reduce((max, row) => Math.max(max, row.key), 0);
      return [...current, blankItem(highest + 1)];
    });
  }

  function removeRow(key: number): void {
    setRows((current) => {
      const remaining = current.filter((row) => row.key !== key);
      if (remaining.length > 0) return remaining;
      const highest = current.reduce((max, row) => Math.max(max, row.key), 0);
      return [blankItem(highest + 1)];
    });
    // The removed row's own control unmounts with it; without this the focus would fall to
    // `<body>` (a11y). Land it on the always-present "Add item" control once React commits.
    requestAnimationFrame(() => {
      sectionRef.current?.querySelector("button")?.focus();
    });
  }

  return (
    <section ref={sectionRef} className="grid gap-3 rounded-none border px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-xs font-semibold">Fee items</h3>
          <p className="text-xs text-muted-foreground">
            At least one. Recurring items need an installment count; one-time items must leave it
            blank.
          </p>
        </div>
        <Button type="button" variant="outline" size="xs" onClick={addRow}>
          Add item
        </Button>
      </div>
      {rows.map((row, index) => (
        <div key={row.key} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
          <TextField
            id={`fee-item-${row.key}-name`}
            name="itemName"
            label="Item name"
            defaultValue={row.name}
            required
          />
          <TextField
            id={`fee-item-${row.key}-amount`}
            name="itemAmount"
            label="Amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={row.amount}
            required
          />
          <SelectField
            id={`fee-item-${row.key}-frequency`}
            name="itemFrequency"
            label="Frequency"
            options={FEE_FREQUENCY_OPTIONS}
            defaultValue={row.frequency}
          />
          <TextField
            id={`fee-item-${row.key}-installmentCount`}
            name="itemInstallmentCount"
            label="Installment count"
            type="number"
            min="1"
            step="1"
            defaultValue={row.installmentCount}
            hint="Required for recurring fees; leave blank for one-time."
          />
          <SelectField
            id={`fee-item-${row.key}-category`}
            name="itemCategory"
            label="Category"
            options={FEE_CATEGORY_OPTIONS}
            defaultValue={row.category}
          />
          <TextField
            id={`fee-item-${row.key}-discountAmount`}
            name="itemDiscountAmount"
            label="Discount amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={row.discountAmount}
            hint="Optional; may not exceed the item amount."
          />
          <TextField
            id={`fee-item-${row.key}-description`}
            name="itemDescription"
            label="Item description"
            defaultValue={row.description}
          />
          <div className="flex items-end justify-between gap-3 pb-2">
            <CheckboxField
              id={`fee-item-${row.key}-isMandatory`}
              name={`itemIsMandatory-${index}`}
              label="Mandatory"
              defaultChecked={row.isMandatory}
            />
            {rows.length > 1 && (
              <Button type="button" variant="ghost" size="xs" onClick={() => removeRow(row.key)}>
                Remove
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * `appliesTo` decides which scope id the structure must carry (and which it must *not*), so the
 * dialog shows exactly one id field. A disabled Base UI select submits no input; an empty
 * TextField arrives as `""` and the optional-id helper turns it into `null`.
 */
function StructureScopeFields({ initialAppliesTo }: { initialAppliesTo?: string | undefined }) {
  const [appliesTo, setAppliesTo] = React.useState<string | null>(initialAppliesTo ?? "all");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ControlledSelect
        id="fee-structure-appliesTo"
        name="appliesTo"
        label="Applies to"
        options={APPLIES_TO_OPTIONS}
        value={appliesTo}
        onValueChange={setAppliesTo}
        required
      />
      {appliesTo === "class" && (
        <TextField
          id="fee-structure-classId"
          name="classId"
          label="Class id"
          hint="The class this structure bills."
          required
        />
      )}
      {appliesTo === "group" && (
        <TextField
          id="fee-structure-groupId"
          name="groupId"
          label="Group id"
          hint="The group this structure bills."
          required
        />
      )}
      {appliesTo === "section" && (
        <TextField
          id="fee-structure-sectionId"
          name="sectionId"
          label="Section id"
          hint="The section this structure bills."
          required
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fee structures                                                              */
/* -------------------------------------------------------------------------- */

export function CreateFeeStructureDialog({ institutionId }: { institutionId: string }) {
  return (
    <EntityDialog
      triggerLabel="New fee structure"
      title="Create a fee structure"
      description="A structure names who is billed, in which currency, and with which fee heads. Invoices are generated from it separately — creating one bills nobody yet."
      action={createFeeStructureAction}
      submitLabel="Create structure"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="fee-structure-name"
          name="name"
          label="Name"
          placeholder="Tuition 2026–27"
          required
        />
        <TextField
          id="fee-structure-currency"
          name="currency"
          label="Currency"
          defaultValue="PKR"
          hint="3-letter ISO code, e.g. PKR."
          required
        />
      </div>
      <StructureScopeFields />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="fee-structure-effectiveFrom"
          name="effectiveFrom"
          label="Effective from"
          type="date"
          required
        />
        <TextField
          id="fee-structure-effectiveTo"
          name="effectiveTo"
          label="Effective to"
          type="date"
          hint="Optional; must be after the start date."
        />
      </div>
      <TextareaField
        id="fee-structure-description"
        name="description"
        label="Description"
        rows={2}
        maxLength={500}
      />
      <CheckboxField
        id="fee-structure-isActive"
        name="isActive"
        label="Active — generation may bill from this structure"
        defaultChecked
      />
      <FeeItemsEditor />
    </EntityDialog>
  );
}

export function EditFeeStructureDialog({
  institutionId,
  structure,
}: Readonly<{
  institutionId: string;
  structure: FeeStructureDetailRow;
}>) {
  return (
    <EntityDialog
      triggerLabel="Edit"
      triggerVariant="outline"
      title="Edit fee structure"
      description="Changes apply to invoices generated from this point on — issued invoices keep the totals they were billed with."
      action={updateFeeStructureAction}
      submitLabel="Save changes"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="id" value={structure.id} />
      <input type="hidden" name="version" value={structure.version} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="fee-structure-edit-name"
          name="name"
          label="Name"
          defaultValue={structure.name}
          required
        />
        <TextField
          id="fee-structure-edit-currency"
          name="currency"
          label="Currency"
          defaultValue={structure.currency}
          hint="3-letter ISO code, e.g. PKR."
          required
        />
      </div>
      <ScopeIdFields structure={structure} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="fee-structure-edit-effectiveFrom"
          name="effectiveFrom"
          label="Effective from"
          type="date"
          defaultValue={structure.effectiveFrom}
          required
        />
        <TextField
          id="fee-structure-edit-effectiveTo"
          name="effectiveTo"
          label="Effective to"
          type="date"
          defaultValue={structure.effectiveTo ?? undefined}
          hint="Optional; must be after the start date."
        />
      </div>
      <TextareaField
        id="fee-structure-edit-description"
        name="description"
        label="Description"
        defaultValue={structure.description ?? undefined}
        rows={2}
        maxLength={500}
      />
      <CheckboxField
        id="fee-structure-edit-isActive"
        name="isActive"
        label="Active — generation may bill from this structure"
        defaultChecked={structure.isActive}
      />
      <FeeItemsEditor initial={structure.items} />
    </EntityDialog>
  );
}

/**
 * The edit form already knows its appliesTo, so the one scope id it posts is fixed — no
 * controlled select needed, unlike the create form. The `appliesTo` value itself travels as a
 * hidden input because the boundary schema reads it.
 */
function ScopeIdFields({ structure }: Readonly<{ structure: FeeStructureDetailRow }>) {
  const { appliesTo } = structure;
  const scopeId =
    appliesTo === "class"
      ? structure.classId
      : appliesTo === "group"
        ? structure.groupId
        : appliesTo === "section"
          ? structure.sectionId
          : null;
  return (
    <>
      <input type="hidden" name="appliesTo" value={appliesTo} />
      {appliesTo !== "all" && (
        <TextField
          id={`fee-structure-edit-${appliesTo}Id`}
          name={`${appliesTo}Id`}
          label={`${appliesTo.charAt(0).toUpperCase()}${appliesTo.slice(1)} id`}
          defaultValue={scopeId ?? undefined}
          hint={`This structure applies to ${appliesTo}s — the id is required.`}
          required
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Invoice generation                                                          */
/* -------------------------------------------------------------------------- */

export function GenerateInvoicesDialog({
  institutionId,
  sessions,
  structures,
}: Readonly<{
  institutionId: string;
  sessions: readonly { id: string; name: string }[];
  /** Active structures the generate page offers; empty string (omitted) means "all applicable". */
  structures: readonly { id: string; name: string }[];
}>) {
  const sessionOptions = sessions.map((session) => ({ value: session.id, label: session.name }));
  const structureOptions: readonly SelectOption[] = [
    { value: "", label: "All applicable structures" },
    ...structures.map((structure) => ({ value: structure.id, label: structure.name })),
  ];

  return (
    <EntityDialog
      triggerLabel="Generate invoices"
      title="Generate invoices"
      description="Prices each in-scope student against every applicable structure and inserts the invoices. Pairs that already have an invoice are skipped — generation never rewrites one."
      action={generateInvoicesAction}
      submitLabel="Generate invoices"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="fee-generate-session"
          name="academicSessionId"
          label="Session"
          options={sessionOptions}
          placeholder={sessions.length === 0 ? "No sessions yet" : "Choose a session"}
          disabled={sessions.length === 0}
          required
        />
        <TextField id="fee-generate-dueOn" name="dueOn" label="Due date" type="date" required />
        <SelectField
          id="fee-generate-structure"
          name="feeStructureId"
          label="Fee structure"
          options={structureOptions}
          defaultValue=""
          hint="Leave as-is to generate from every structure in force."
        />
      </div>
      <TextareaField
        id="fee-generate-note"
        name="note"
        label="Note"
        hint="Optional; copied onto each generated invoice."
        rows={2}
        maxLength={500}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One payment allocated to one invoice — the common cashier path. The allocation itself is not a
 * form field: the action turns the hidden `invoiceId` plus the payment `amount` into a single
 * allocation of the full amount (the schema still caps allocations at the payment total, so a
 * future multi-row variant can post repeated `allocationInvoiceId` / `allocationAmount` parts
 * instead). `invoice.outstanding` is the read model's derived figure (`ADR-0003` — never
 * stored), shown as a hint so the cashier does not over- or under-collect by guesswork.
 */
export function RecordPaymentDialog({
  institutionId,
  studentId,
  academicSessionId,
  invoice,
}: Readonly<{
  institutionId: string;
  studentId: string;
  academicSessionId: string;
  invoice: Readonly<{ id: string; currency: string; outstanding: string }>;
}>) {
  return (
    <EntityDialog
      triggerLabel="Record payment"
      title="Record a payment"
      description="Allocates the full amount to this invoice and stamps the receiving user — the client never supplies the cashier."
      action={recordFeePaymentAction}
      submitLabel="Record payment"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="academicSessionId" value={academicSessionId} />
      <input type="hidden" name="invoiceId" value={invoice.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="fee-payment-amount"
          name="amount"
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          hint={`Outstanding on this invoice: ${invoice.outstanding} ${invoice.currency}.`}
          required
        />
        <TextField
          id="fee-payment-currency"
          name="currency"
          label="Currency"
          defaultValue={invoice.currency}
          hint="Must match the invoice's currency."
          required
        />
        <SelectField
          id="fee-payment-method"
          name="method"
          label="Method"
          options={PAYMENT_METHOD_OPTIONS}
          defaultValue="cash"
          required
        />
        <TextField
          id="fee-payment-referenceNumber"
          name="referenceNumber"
          label="Reference number"
          hint="Cheque, transfer or gateway reference — required unless paying by cash."
        />
        <TextField
          id="fee-payment-receivedOn"
          name="receivedOn"
          label="Received on"
          type="date"
          defaultValue={today()}
          required
        />
      </div>
      <TextareaField id="fee-payment-notes" name="notes" label="Notes" rows={2} maxLength={1000} />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Concessions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A concession against one invoice. The schema demands exactly one basis (percentage *or*
 * fixed amount) and exactly one target — the dialog's hidden `invoiceId` satisfies the target,
 * and the two basis fields carry the "exactly one" rule as their shared hint; the service is
 * still the authority.
 */
export function GrantConcessionDialog({
  institutionId,
  studentId,
  invoiceId,
}: Readonly<{
  institutionId: string;
  studentId: string;
  invoiceId: string;
}>) {
  return (
    <EntityDialog
      triggerLabel="Grant concession"
      title="Grant a concession"
      description="Records a discount, waiver or scholarship against this invoice. The invoice's frozen total does not change — the concession is an audited row beside it."
      action={grantFeeConcessionAction}
      submitLabel="Grant concession"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SelectField
        id="fee-concession-kind"
        name="kind"
        label="Kind"
        options={CONCESSION_KIND_OPTIONS}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="fee-concession-percentage"
          name="percentage"
          label="Percentage"
          type="number"
          min="0"
          max="100"
          step="1"
          hint="Give either a percentage or a fixed amount — exactly one."
        />
        <TextField
          id="fee-concession-amount"
          name="amount"
          label="Fixed amount"
          type="number"
          min="0"
          step="0.01"
          hint="Give either a percentage or a fixed amount — exactly one."
        />
      </div>
      <TextareaField
        id="fee-concession-reason"
        name="reason"
        label="Reason"
        hint="Shown wherever this concession is reviewed."
        required
        rows={2}
        maxLength={500}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Deferrals                                                                   */
/* -------------------------------------------------------------------------- */

export function RequestDeferralDialog({
  institutionId,
  invoiceId,
}: Readonly<{
  institutionId: string;
  invoiceId: string;
}>) {
  return (
    <EntityDialog
      triggerLabel="Request deferral"
      title="Request a payment deferral"
      description="Asks for collection to be postponed through a chosen window. It takes effect only once approved — a request on its own changes nothing."
      action={requestFeeDeferralAction}
      submitLabel="Request deferral"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <TextareaField
        id="fee-deferral-reason"
        name="reason"
        label="Reason"
        required
        rows={2}
        maxLength={500}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="fee-deferral-requestedFrom"
          name="requestedFrom"
          label="Requested from"
          type="date"
          required
        />
        <TextField
          id="fee-deferral-requestedUntil"
          name="requestedUntil"
          label="Requested until"
          type="date"
          hint="Must be after the start date."
          required
        />
      </div>
    </EntityDialog>
  );
}

/**
 * Approve or reject a pending deferral. The store's optimistic-concurrency check compares the
 * *invoice's* version, so `version` (the invoice row's token) travels as a hidden input the
 * page fills from the invoice it rendered — a stale dialog fails with a conflict rather than
 * silently deciding a deferral that moved underneath it.
 */
export function DecideDeferralDialog({
  institutionId,
  deferralId,
  invoiceId,
  version,
}: Readonly<{
  institutionId: string;
  deferralId: string;
  invoiceId: string;
  /** The invoice row's optimistic-concurrency token (`InvoiceDetailRow.version`). */
  version: number;
}>) {
  return (
    <EntityDialog
      triggerLabel="Decide"
      triggerVariant="outline"
      title="Decide this deferral"
      description="Approving suspends collection through the requested window; rejecting leaves the invoice due as billed. Approval demands notes — they are the audit trail."
      action={decideFeeDeferralAction}
      submitLabel="Save decision"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="deferralId" value={deferralId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="version" value={version} />
      <CheckboxField id="fee-deferral-isApproved" name="isApproved" label="Approve this deferral" />
      <TextareaField
        id="fee-deferral-approverNotes"
        name="approverNotes"
        label="Decision notes"
        hint="Required when approving."
        rows={2}
        maxLength={2000}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Credit notes                                                                */
/* -------------------------------------------------------------------------- */

export function CreateCreditNoteDialog({
  institutionId,
  invoiceId,
}: Readonly<{
  institutionId: string;
  invoiceId: string;
}>) {
  return (
    <EntityDialog
      triggerLabel="Issue credit note"
      title="Issue a credit note"
      description="An audited correction against this invoice — the invoice's frozen total stays as billed, and the credit appears beside it."
      action={createFeeCreditNoteAction}
      submitLabel="Issue credit note"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <TextField
        id="fee-creditNote-amount"
        name="amount"
        label="Amount"
        type="number"
        min="0"
        step="0.01"
        required
      />
      <TextareaField
        id="fee-creditNote-reason"
        name="reason"
        label="Reason"
        hint="Required — shown wherever this credit note is reviewed."
        required
        rows={2}
        maxLength={500}
      />
    </EntityDialog>
  );
}
