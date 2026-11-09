/**
 * The authenticated application shell (`PHASES.md` §13 task 2, `DESIGN.md` §5).
 *
 * A server component that composes the role-filtered navigation (`AppSidebar`), the top bar
 * (`AppHeader`) and the mobile bottom bar into the layout every portal shares. Per `RULES.md` §57
 * it stays on the server: the only client state is what the sidebar primitives themselves manage
 * (collapse state, mobile drawer).
 *
 * Generation order: 1. sidebar and header; 2. content; 3. mobile bottom bar (fixed, so it overlays
 * the content's padded bottom edge on small screens).
 */
import type { NavItem } from "@/lib/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export interface AppShellProps {
  /** The principal's navigation groups — already filtered by `navigationFor` server-side. */
  readonly navGroups: Parameters<typeof AppSidebar>[0]["groups"];
  /** Primary mobile actions: Dashboard plus the first enabled entries the principal may use. */
  readonly primaryItems: readonly NavItem[];
  readonly email: string;
  readonly name: string | null;
  readonly children: React.ReactNode;
}

export function AppShell({
  navGroups,
  primaryItems,
  email,
  name,
  children,
}: Readonly<AppShellProps>) {
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-xs focus:font-medium focus:text-primary-foreground focus:shadow-md focus:ring-2 focus:ring-ring focus:outline-none"
      >
        Skip to main content
      </a>
      <AppSidebar groups={navGroups} />
      <SidebarInset>
        <AppHeader email={email} name={name} />
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-5 pb-20 md:px-6 md:py-6 md:pb-6 outline-none">
          {children}
        </main>
        <MobileBottomNav items={primaryItems} />
      </SidebarInset>
    </SidebarProvider>
  );
}
