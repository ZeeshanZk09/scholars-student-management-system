import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { PermissionKey } from "@/shared/authorization";

import { NAV_GROUPS, navigationFor, type NavGroup, type NavItem } from "./navigation";

/** A minimal shared fixture — realistic shape, deterministic content, immune to NAV_GROUPS churn. */
const DashboardIcon = () => null;
const GenericIcon = () => null;

const GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", description: "", icon: DashboardIcon }],
  },
  {
    label: "Academic",
    items: [
      {
        href: "/students",
        label: "Students",
        description: "",
        icon: GenericIcon,
        permission: "students.view",
      },
      { href: "/academics/classes", label: "Classes", description: "", icon: GenericIcon },
    ],
  },
];

const canAll: (permission: PermissionKey) => boolean = () => true;
const cannot: (permission: PermissionKey) => boolean = () => false;
const canOnly =
  (...keys: readonly PermissionKey[]): ((permission: PermissionKey) => boolean) =>
  (permission) =>
    keys.includes(permission);

describe("navigationFor", () => {
  it("keeps every item when every permission is granted", () => {
    const result = navigationFor(GROUPS, canAll);
    expect(result.map((g) => g.items.map((i) => i.href))).toEqual([
      ["/"],
      ["/students", "/academics/classes"],
    ]);
  });

  it("drops a permission-gated item the principal lacks", () => {
    const result = navigationFor(GROUPS, cannot);
    expect(result).toHaveLength(2);
    expect(result[0]!.items.map((i) => i.href)).toEqual(["/"]);
    expect(result[1]!.items.map((i) => i.href)).toEqual(["/academics/classes"]);
  });

  it("keeps an ungated item for any authenticated principal", () => {
    const result = navigationFor(GROUPS, cannot);
    expect(result[0]!.items.map((i) => i.href)).toEqual(["/"]);
  });

  it("drops an entire group once none of its items survive", () => {
    const result = navigationFor(
      [{ label: "Secret", items: [{ ...GROUPS[1]!.items[0]! }] }],
      cannot,
    );
    expect(result).toHaveLength(0);
  });

  it("answers only for defined permissions — the caller never sees undefined", () => {
    const seen: (PermissionKey | undefined)[] = [];
    navigationFor(GROUPS, (permission) => {
      seen.push(permission);
      return true;
    });
    expect(seen).not.toContain(undefined);
  });

  it("is practical on the real nav: a super-admin sees every group, a bare account only ungated ones", () => {
    const superAdmin = navigationFor(NAV_GROUPS, canAll);
    expect(superAdmin.length).toBe(NAV_GROUPS.length);

    const bare = navigationFor(NAV_GROUPS, cannot);
    const bareHrefs = bare.flatMap((g) => g.items.map((i) => i.href));
    // Everything with a permission key is hidden for a capability-less account.
    expect(bareHrefs).not.toContain("/students");
    expect(bareHrefs).not.toContain("/fees");
    expect(bareHrefs).not.toContain("/admin/users");
    expect(bareHrefs).not.toContain("/reports");
    // Ungated items survive for any authenticated principal (no key exists in the vocabulary yet).
    expect(bareHrefs).toContain("/");
    expect(bareHrefs).toContain("/notifications");
  });

  it("matches the seeded role bundles for a read-only teacher-style slice", () => {
    // The seeded teacher bundle (`scripts/seed.ts`) holds attendance.view/mark, results.view/enter
    // and students.view. Those perform different nav entries.
    const slice = navigationFor(
      NAV_GROUPS,
      canOnly("attendance.view", "results.view", "students.view"),
    );
    const hrefs = slice.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/students");
    expect(hrefs).toContain("/attendance");
    expect(hrefs).toContain("/examinations");
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/fees");
  });
});

describe("NAV_GROUPS shape", () => {
  it("defines the DESIGN §7 structure with stable hrefs", () => {
    const nav: readonly NavItem[] = NAV_GROUPS.flatMap((g) => [...g.items]);
    for (const item of nav) {
      expect(item.href).toMatch(/^\//);
      expect(item.label.length).toBeGreaterThan(0);
    }
    expect.assertions(nav.length * 2);
  });
});

/**
 * The guard for the failure mode `disabled` exists to prevent: a menu that links somewhere there is
 * no `page.tsx` (a 404 in the sidebar and in the mobile bottom bar), or one that hides a page that
 * is live. The flag is a claim about the file system, so it is checked against the file system
 * rather than against a hard-coded list that would rot the moment a route is added.
 */
describe("NAV_GROUPS disabled flag against the routes that actually exist", () => {
  /** Every URL `src/app` serves as a page. Route groups (`(app)`) are folders, not URL segments. */
  function collectPageRoutes(dir: string, urlPath: string): Set<string> {
    const routes = new Set<string>();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
        for (const route of collectPageRoutes(join(dir, entry.name), `${urlPath}${segment}`)) {
          routes.add(route);
        }
        continue;
      }
      if (entry.name === "page.tsx" || entry.name === "page.ts") {
        routes.add(urlPath === "" ? "/" : urlPath);
      }
    }
    return routes;
  }

  const appDir = fileURLToPath(new URL("../app", import.meta.url));
  const routes = collectPageRoutes(appDir, "");

  it("enables exactly the hrefs that have a page behind them", () => {
    const mismatches = NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => (item.disabled ?? false) !== !routes.has(item.href))
      .map((item) =>
        item.disabled === true
          ? `${item.href} is marked disabled but ${item.href} has a page`
          : `${item.href} is enabled but has no page`,
      );

    expect(mismatches).toEqual([]);
  });

  it("finds the routes it is about to check (the test would pass vacuously otherwise)", () => {
    // The dashboard must be reachable: it is the one item every principal sees, and if the walk
    // above ever silently returns nothing this assertion fails instead of the suite going green.
    expect(routes.has("/")).toBe(true);
    expect(routes.has("/login")).toBe(true);
  });
});
