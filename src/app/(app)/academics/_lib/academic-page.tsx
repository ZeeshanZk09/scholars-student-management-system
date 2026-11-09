/**
 * The frame every `/academics/*` page renders inside — now a thin preset of the shared
 * `InstitutionPage` (`src/app/(app)/_lib/institution-page.tsx`), pinned to `academic.manage`,
 * the academics breadcrumb and the exact empty-state copy its eight pages have always shown.
 *
 * The pages keep importing `AcademicPage` and stay byte-for-byte compatible; new
 * institution-scoped pages (students, guardians, …) should import `InstitutionPage` directly
 * and supply their own permission and copy instead of adding another preset.
 */
import type { ReactNode } from "react";

import type { BreadcrumbEntry } from "@/components/shared/page-header";

import {
  InstitutionPage,
  type InstitutionContext,
  type InstitutionPageContext,
} from "../../_lib/institution-page";

export type { InstitutionContext, InstitutionPageContext };

export interface AcademicPageProps {
  readonly title: string;
  readonly description: string;
  readonly breadcrumb?: readonly BreadcrumbEntry[] | undefined;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
  readonly actions?: ((ctx: InstitutionPageContext) => ReactNode | Promise<ReactNode>) | undefined;
  readonly render: (ctx: InstitutionContext) => ReactNode | Promise<ReactNode>;
}

export async function AcademicPage({
  title,
  description,
  breadcrumb,
  searchParams,
  actions,
  render,
}: AcademicPageProps): Promise<ReactNode> {
  return (
    <InstitutionPage
      permission="academic.manage"
      title={title}
      description={description}
      breadcrumb={
        breadcrumb ?? [
          { label: "Home", href: "/" },
          { label: "Academic", href: "/academics" },
          { label: title },
        ]
      }
      searchParams={searchParams}
      accessDenied="You do not have permission to manage academic structure."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its academic structure.",
        noInstitution:
          "Academic structure belongs to an institution. Add one to start defining sessions, classes and subjects.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={actions}
      render={render}
    />
  );
}
