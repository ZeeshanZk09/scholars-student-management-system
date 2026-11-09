"use client";

/**
 * The icon barrel. Phosphor's ESM entry calls `createContext` at module scope, which crashes when
 * Turbopack evaluates the package's ESM inside the RSC/server bundle (Next 16). Marking this module
 * `"use client"` turns every export into a client reference, so server components and `@/lib/*`
 * data modules can still *type* and *pass* icons without ever evaluating them server-side — the
 * same pattern `src/components/ui/sonner.tsx` already relies on.
 */
import {
  ArrowsLeftRightIcon,
  BankIcon,
  BellIcon,
  BooksIcon,
  BrainIcon,
  BuildingIcon,
  BuildingApartmentIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  CaretUpDownIcon,
  ChartBarIcon,
  ChartLineIcon,
  ChalkboardTeacherIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ClockIcon,
  ExamIcon,
  FunnelIcon,
  GraduationCapIcon,
  KeyIcon,
  ListNumbersIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  MoneyIcon,
  NotePencilIcon,
  ReceiptIcon,
  ScrollIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  SquaresFourIcon,
  StudentIcon,
  SwapIcon,
  TrashIcon,
  UserListIcon,
  UsersIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  XIcon,
  type IconProps,
} from "@phosphor-icons/react";

import type { ComponentType } from "react";

export type { IconProps };

/** A Phosphor icon component usable from server modules, pages and shared components. */
export type AppIcon = ComponentType<IconProps>;

export {
  ArrowsLeftRightIcon,
  BankIcon,
  BellIcon,
  BooksIcon,
  BrainIcon,
  BuildingIcon,
  BuildingApartmentIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  CaretUpDownIcon,
  ChartBarIcon,
  ChartLineIcon,
  ChalkboardTeacherIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ClockIcon,
  ExamIcon,
  FunnelIcon,
  GraduationCapIcon,
  KeyIcon,
  ListNumbersIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  MoneyIcon,
  NotePencilIcon,
  ReceiptIcon,
  ScrollIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  SquaresFourIcon,
  StudentIcon,
  SwapIcon,
  TrashIcon,
  UserListIcon,
  UsersIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  XIcon,
};
