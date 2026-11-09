"use client";

/**
 * The desktop-and-drawer navigation surface (`PHASES.md` §13 tasks 2–3, `DESIGN.md` §7–§8).
 *
 * Pure presentation: the server layout has already resolved the principal and produced the
 * filtered `groups` via `navigationFor` (`src/lib/navigation.ts`), so this component never asks
 * "who am I" — it renders the menu it was given. Hiding a row here is not an authorization
 * mechanism (`RULES.md` §19); every target route guards itself server-side.
 *
 * Disabled rows are targets whose page ships in a later phase — inert (no link) with a "Planned"
 * badge, so the roadmap stays visible instead of routing to a 404. The flag is flipped when the
 * backing phase lands.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GraduationCap } from "@phosphor-icons/react";

import type { NavGroup, NavItem } from "@/lib/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function AppSidebar({ groups }: Readonly<{ groups: readonly NavGroup[] }>) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              isActive={pathname === "/"}
              render={<Link href="/" />}
              className="gap-2 p-2 data-active:bg-transparent"
            >
              <div className="flex size-6 items-center justify-center bg-primary text-primary-foreground">
                <GraduationCap className="size-4" weight="bold" />
              </div>
              <span className="font-semibold">Scholars</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="sidebar-scrollbar">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavRow key={`${group.label}:${item.href}`} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

function NavRow({ item, pathname }: Readonly<{ item: NavItem; pathname: string }>) {
  const active = isActive(item.href, pathname);

  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-disabled="true"
          className="cursor-not-allowed opacity-60"
          render={<span />}
        >
          <item.icon />
          <span>{item.label}</span>
          <SidebarMenuBadge className="right-10">Planned</SidebarMenuBadge>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={item.label} render={<Link href={item.href} />}>
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Active-state rule: exact match for the dashboard root, prefix match for everything else so a
 * section stays highlighted across its sub-routes (`/students` matches `/students/123/edit`).
 */
function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
