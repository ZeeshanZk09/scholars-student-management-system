/**
 * Navigation architecture (`PHASES.md` §13 task 1, `DESIGN.md` §6–§8).
 *
 * One declarative model drives every shell surface — the desktop sidebar, the mobile drawer and
 * (soon) the mobile bottom bar. Each item is gated by a `PermissionKey`; `navigationFor` applies
 * the resolved principal's capabilities so **the same data yields a different menu per role** —
 * which is exactly `DESIGN.md` §6's "navigation must be role-aware".
 *
 * Two reminders embedded in the shape of the type:
 *
 * - Permission gating here is **presentational only.** Hiding a nav item is not an authorization
 *   mechanism (`RULES.md` §19); every route these items point to is still guarded server-side by
 *   `requireUserPermission`. If this filter were bypassed tomorrow, a student would *see* a link
 *   but still be denied by the page.
 * - `disabled` marks a target whose page ships in a later phase. It renders inert with a "Planned"
 *   badge instead of a 404. The flag is flipped off when the backing phase lands — the seam each
 *   subsequent phase uses to reveal its feature.
 */
import type { ComponentType } from "react";
import {
  ArrowsLeftRightIcon,
  BankIcon,
  BellIcon,
  BooksIcon,
  BrainIcon,
  BuildingIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  ChartLineIcon,
  ChalkboardTeacherIcon,
  ClipboardTextIcon,
  ClockIcon,
  ExamIcon,
  FunnelIcon,
  GraduationCapIcon,
  ListNumbersIcon,
  MegaphoneIcon,
  MoneyIcon,
  NotePencilIcon,
  ReceiptIcon,
  ScrollIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  StudentIcon,
  SwapIcon,
  UserListIcon,
  UsersIcon,
  UsersThreeIcon,
  type IconProps,
} from "@/components/ui/icons";

import type { PermissionKey } from "@/shared/authorization";

/** A Phosphor icon component, as rendered by the sidebar and page headers. */
export type NavIcon = ComponentType<IconProps>;

export interface NavItem {
  /** Next.js route. Route groups are not part of the URL, so `(app)/students` is `/students`. */
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly icon: NavIcon;
  /**
   * The capability that gates this item. `undefined` = visible to any authenticated principal
   * (there is no permission key for it in the 27-key vocabulary). See module note.
   */
  readonly permission?: PermissionKey;
  /** True until the backing page ships in a later phase — inert, rendered with a "Planned" badge. */
  readonly disabled?: boolean;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** The full navigation model for the application shell (`DESIGN.md` §7's structure). */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        description: "Your institution at a glance",
        icon: SquaresFourIcon,
      },
    ],
  },
  {
    label: "Academic",
    items: [
      {
        href: "/students",
        label: "Students",
        description: "Enrolled students and their records",
        icon: StudentIcon,
        permission: "students.view",
        disabled: true,
      },
      {
        href: "/academics/classes",
        label: "Classes & Sections",
        description: "Classes, sections and academic levels",
        icon: ChalkboardTeacherIcon,
        permission: "academic.manage",
        disabled: true,
      },
      {
        href: "/academics/years",
        label: "Academic Years",
        description: "Session calendar and promotion timeline",
        icon: CalendarBlankIcon,
        permission: "academic.manage",
        disabled: true,
      },
      {
        href: "/academics/groups",
        label: "Groups",
        description: "Groups within sections",
        icon: UsersIcon,
        permission: "academic.manage",
        disabled: true,
      },
      {
        href: "/academics/subjects",
        label: "Subjects",
        description: "Subjects taught across the institution",
        icon: BooksIcon,
        permission: "academic.manage",
        disabled: true,
      },
      {
        href: "/academics/departments",
        label: "Departments",
        description: "Academic departments and designations",
        icon: BuildingIcon,
        permission: "academic.manage",
        disabled: true,
      },
      {
        href: "/academics/facilities",
        label: "BuildingsIcon & Floors",
        description: "Facility map used by attendance",
        icon: BuildingsIcon,
        permission: "academic.manage",
        disabled: true,
      },
      {
        href: "/academics/time-slots",
        label: "Time Slots",
        description: "Timetable slots and periods",
        icon: ClockIcon,
        permission: "academic.manage",
        disabled: true,
      },
    ],
  },
  {
    label: "Enrolment",
    items: [
      {
        href: "/admissions",
        label: "Admissions",
        description: "Enquiry to enrolment pipeline",
        icon: GraduationCapIcon,
        permission: "admissions.view",
        disabled: true,
      },
      {
        href: "/guardians",
        label: "Guardians",
        description: "Parent and guardian contacts",
        icon: UsersThreeIcon,
        permission: "guardians.view",
        disabled: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/attendance",
        label: "Attendance",
        description: "Daily attendance and registers",
        icon: ClipboardTextIcon,
        permission: "attendance.view",
        disabled: true,
      },
      {
        href: "/floor-operations",
        label: "Floor Operations",
        description: "Floor duty and supervision",
        icon: ListNumbersIcon,
        disabled: true,
      },
      {
        href: "/replacements",
        label: "Replacements",
        description: "Absence cover for absent staff",
        icon: SwapIcon,
        disabled: true,
      },
    ],
  },
  {
    label: "Classroom",
    items: [
      {
        href: "/daily-tests",
        label: "Daily Tests",
        description: "Daily and weekly testing",
        icon: FunnelIcon,
        disabled: true,
      },
      {
        href: "/diary",
        label: "Diary",
        description: "Lesson diary and homework",
        icon: NotePencilIcon,
        disabled: true,
      },
      {
        href: "/examinations",
        label: "Examinations",
        description: "Term exams and results entry",
        icon: ExamIcon,
        permission: "results.view",
        disabled: true,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        href: "/fees",
        label: "Fees",
        description: "Fee structures and collections",
        icon: MoneyIcon,
        permission: "fees.view",
        disabled: true,
      },
      {
        href: "/finance/transactions",
        label: "Transactions",
        description: "Payment and receipt register",
        icon: ArrowsLeftRightIcon,
        permission: "fees.view",
        disabled: true,
      },
      {
        href: "/finance/expenses",
        label: "Expenses",
        description: "School expenditure",
        icon: ReceiptIcon,
        permission: "fees.view",
        disabled: true,
      },
      {
        href: "/finance/payroll",
        label: "Payroll",
        description: "Staff salary processing",
        icon: BankIcon,
        disabled: true,
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/hr/employees",
        label: "Employees",
        description: "Staff records and contracts",
        icon: UserListIcon,
        disabled: true,
      },
      {
        href: "/hr/leave",
        label: "Leave",
        description: "Leave requests and balances",
        icon: CalendarBlankIcon,
        disabled: true,
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        description: "Broadcast and targeted notices",
        icon: BellIcon,
        disabled: true,
      },
      {
        href: "/announcements",
        label: "Announcements",
        description: "Public announcements",
        icon: MegaphoneIcon,
        disabled: true,
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        href: "/reports",
        label: "Reports",
        description: "Academic, attendance and financial reports",
        icon: ChartBarIcon,
        permission: "reports.view",
        disabled: true,
      },
      {
        href: "/reports/finance",
        label: "Financial Reports",
        description: "Fee, payment and expense summaries",
        icon: ChartLineIcon,
        permission: "reports.view",
        disabled: true,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        description: "Accounts, credentials and access",
        icon: UsersThreeIcon,
        permission: "users.view",
        disabled: true,
      },
      {
        href: "/admin/roles",
        label: "Roles & Permissions",
        description: "Roles, bundles and grants",
        icon: ShieldCheckIcon,
        permission: "roles.view",
        disabled: true,
      },
      {
        href: "/admin/settings",
        label: "Settings",
        description: "Institution configuration",
        icon: BrainIcon,
        permission: "settings.manage",
        disabled: true,
      },
      {
        href: "/admin/audit",
        label: "Audit Trail",
        description: "Immutable audit log",
        icon: ScrollIcon,
        permission: "audit.view",
        disabled: true,
      },
    ],
  },
];

/**
 * The navigation *as seen by* a principal. Pure data transformation — no I/O, no auth — so it is
 * directly unit-testable. A group with no surviving items disappears entirely; a permission-gated
 * item dies when the principal lacks its key; ungated items survive for any authenticated user
 * (`can` only ever receives defined permissions, so callers never answer for `undefined`).
 */
export function navigationFor(
  groups: readonly NavGroup[],
  can: (permission: PermissionKey) => boolean,
): readonly NavGroup[] {
  const visible: NavGroup[] = [];

  for (const group of groups) {
    const items = group.items.filter(
      (item) => item.permission === undefined || can(item.permission),
    );
    if (items.length > 0) {
      visible.push({ ...group, items });
    }
  }

  return visible;
}
