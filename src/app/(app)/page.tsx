/**
 * The pre-shell home page (Phase 5 replaces this with a real dashboard) — now demonstrates the
 * Phase 4 permission-aware UI server side: what renders depends on resolved capabilities, and
 * the same decision is truly enforced at the action layer via `requireUserPermission`.
 */
import { canUser } from "@/lib/permissions";

const CAPABILITIES = [
  { key: "users.view", label: "View users" },
  { key: "students.update", label: "Edit students" },
  { key: "attendance.mark", label: "Mark attendance" },
  { key: "fees.refund", label: "Refund fees" },
] as const;

export default async function Home() {
  const held = await Promise.all(CAPABILITIES.map((c) => canUser(c.key)));

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Welcome</h1>
        <p className="text-sm text-muted-foreground">
          This page is permission-aware: it shows only the capabilities your account currently
          holds, resolved from the live authorization data.
        </p>
      </div>

      <ul className="space-y-2">
        {CAPABILITIES.map((capability, i) => (
          <li
            key={capability.key}
            className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
              held[i] === true ? "border-emerald-200 bg-emerald-50" : "border-border bg-muted/40"
            }`}
          >
            <span>{capability.label}</span>
            <span
              className={`text-xs ${held[i] === true ? "text-emerald-700" : "text-muted-foreground"}`}
            >
              {held[i] === true ? "Granted" : "Not granted"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
