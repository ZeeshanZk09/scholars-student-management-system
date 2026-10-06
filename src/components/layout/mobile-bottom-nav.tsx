"use client";

/**
 * Mobile navigation paradigm (`PHASES.md` §13 task 14, `DESIGN.md` §8): a bottom action bar for
 * the most-used surfaces instead of shrinking the desktop sidebar. Secondary navigation stays in
 * the drawer that `SidebarTrigger` opens.
 *
 * The server picks the `items` (Dashboard + the first enabled entries the principal may use) so
 * this bar is role-aware by construction and never re-asks "who am I". It renders only when there
 * is more than one place to go — a single row would be noise.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/lib/navigation";

import { cn } from "cn";

export function MobileBottomNav({ items }: Readonly<{ items: readonly NavItem[] }>) {
  const pathname = usePathname();

  if (items.length < 2) {
    return null;
  }

  return (
    <nav
      aria-label="Primary actions"
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="grid grid-flow-col auto-cols-fr">
        {items.slice(0, 5).map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem]",
                  active ? "font-medium text-primary" : "text-muted-foreground",
                )}
              >
                <Icon size={20} weight={active ? "bold" : "regular"} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
