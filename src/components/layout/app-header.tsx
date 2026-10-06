"use client";

/**
 * The top bar of the authenticated shell (`PHASES.md` §13 task 2).
 *
 * Kept deliberately lean: sidebar toggle (drawer on mobile), the current section title seeded by
 * the server layout, the signed-in identity, and a permanently visible Sign out control — the
 * e2e suite and the credential-revocation flow both rely on Sign out surviving on every page
 * without opening a menu.
 */
import { logoutAction } from "@/modules/auth/ui/actions";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

export interface AppHeaderProps {
  /** Signed-in identity. `null` name renders just the email. */
  readonly email: string;
  readonly name: string | null;
}

export function AppHeader({ email, name }: Readonly<AppHeaderProps>) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 md:px-4">
      <div className="flex min-w-0 items-center gap-1">
        <SidebarTrigger />
        <span className="hidden truncate text-sm font-medium md:inline" aria-hidden="true">
          Scholars
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {name !== null && name.length > 0 ? `${name} · ` : ""}
          {email}
        </span>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
