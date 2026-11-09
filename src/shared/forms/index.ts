/**
 * `FormState` — the serialisable result every server action returns to `useActionState`.
 *
 * One discriminated union, in one place, because the shape is a *protocol* between a `"use server"`
 * action and a client form: three near-identical copies (one weaker, with a loose
 * `status: "idle" | "error" | "done"` field and optional `message` on every arm) let a client
 * narrow on something a particular action never sets, and let an action return a state the shell
 * does not render. `src/shared/` is where this repo keeps cross-module contracts
 * (`errors/`, `authorization/`, `validation/`), and this belongs with them.
 *
 * Rules the union encodes:
 *
 * - The client switches on `status`, **never on the message** — prose is for humans, status is
 *   for control flow (`src/modules/auth/ui/actions.ts`).
 * - `message` and `issues` exist only where they mean something: `idle` has neither (nothing
 *   happened yet), `done` has a confirmation, `error` has a reason and optional field-level
 *   issues from a `ValidationError` (`src/shared/errors/app-error.ts`).
 * - Nothing optional-with-`undefined` slips in: an arm that carries `message` requires it, so a
 *   form cannot render an empty success toast because a caller forgot the field.
 */
export type FormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly issues?: readonly string[];
    }
  | { readonly status: "done"; readonly message: string };

/** The signature every action passed to `FormShell` / `useActionState` must have. */
export type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

/** The initial state a form starts in. */
export const IDLE_FORM_STATE: FormState = { status: "idle" };
