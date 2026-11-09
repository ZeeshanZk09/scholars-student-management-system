/**
 * The frame every institution-scoped page renders inside: gate, resolve the institution, render
 * the header, then hand the resolved context to the page body.
 *
 * Keeping these steps here rather than in each page means the pages cannot drift — a new
 * institution-scoped page is `data + a body function`, and the authorization, the URL-selected
 * institution, the switcher and the "you have no institution yet" states come with it. The
 * academics route keeps its own thin preset (`../academics/_lib/academic-page.tsx`) so its copy
 * and default breadcrumb stay exactly where its pages already expect them.
 *
 * `render` may be async: the body needs `ctx.institution.id` before it can query, so the frame
 * awaits it rather than asking each page to smuggle a promise into JSX (React does not await a
 * promise returned by an ordinary function call).
 */
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader, type BreadcrumbEntry } from "@/components/shared/page-header";
import { BuildingApartmentIcon } from "@/components/ui/icons";
import { InstitutionSwitcher } from "@/modules/academic/ui/institution-switcher";
import type { InstitutionRow } from "@/modules/academic";
import type { PermissionKey } from "@/shared/authorization";
import { ForbiddenError } from "@/shared/errors";

import { resolveInstitutionContext, type InstitutionPageContext } from "./context";

export type { InstitutionPageContext };

/**
 * The context a body actually receives: `InstitutionPage` only calls `render` once an
 * institution has been resolved, and this narrowed type is how that guarantee reaches TypeScript
 * — without every page re-proving a fact the frame already established.
 */
export type InstitutionContext = InstitutionPageContext & {
  readonly institution: InstitutionRow;
};

/**
 * The three "nothing to show" reasons share titles but not copy: what a *platform admin* should
 * do next depends on what this page is for (pick an academic structure vs. add a tenant to start
 * enrolling students), so each page supplies its own descriptions.
 */
export interface InstitutionPageEmptyCopy {
  readonly chooseInstitution: string;
  readonly noInstitution: string;
  readonly noMembership: string;
}

export interface InstitutionPageProps {
  readonly permission: PermissionKey;
  readonly title: string;
  readonly description: string;
  readonly breadcrumb: readonly BreadcrumbEntry[];
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Description for the "you lack `permission`" state; the title is always "Access denied". */
  readonly accessDenied: string;
  readonly empty: InstitutionPageEmptyCopy;
  /**
   * Heading-right actions. Receives the context so a create button can wait for a target — and
   * may be async, because a dialog whose option list is the institution's own data has to read
   * it before it can render. The frame awaits it either way.
   */
  readonly actions?: ((ctx: InstitutionPageContext) => ReactNode | Promise<ReactNode>) | undefined;
  readonly render: (ctx: InstitutionContext) => ReactNode | Promise<ReactNode>;
}

export async function InstitutionPage({
  permission,
  title,
  description,
  breadcrumb,
  searchParams,
  accessDenied,
  empty,
  actions,
  render,
}: InstitutionPageProps): Promise<ReactNode> {
  let ctx: InstitutionPageContext;
  try {
    const params = await searchParams;
    ctx = await resolveInstitutionContext(permission, params.institution);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <ErrorState title="Access denied" description={accessDenied} />;
    }
    throw error;
  }

  const switcher =
    ctx.institutions.length > 1 ? (
      <InstitutionSwitcher institutions={ctx.institutions} value={ctx.institution?.id ?? ""} />
    ) : null;
  const pageActions = await Promise.resolve(actions?.(ctx));
  const headerActions =
    switcher !== null || (pageActions !== null && pageActions !== undefined) ? (
      <>
        {switcher}
        {pageActions}
      </>
    ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumb={breadcrumb}
        actions={headerActions}
      />

      {ctx.institution === null ? (
        <NoInstitutionState ctx={ctx} copy={empty} />
      ) : (
        await render({ ...ctx, institution: ctx.institution })
      )}
    </div>
  );
}

/**
 * Three distinct reasons for "nothing to show", because they need three different next steps:
 * several tenants and no pick, no tenant at all, or a user who belongs to none.
 */
function NoInstitutionState({
  ctx,
  copy,
}: Readonly<{ ctx: InstitutionPageContext; copy: InstitutionPageEmptyCopy }>) {
  if (ctx.institutions.length > 0) {
    return (
      <EmptyState
        icon={BuildingApartmentIcon}
        title="Choose an institution"
        description={copy.chooseInstitution}
      />
    );
  }
  if (ctx.isPlatformAdmin) {
    return (
      <EmptyState
        icon={BuildingApartmentIcon}
        title="No institution yet"
        description={copy.noInstitution}
      />
    );
  }
  return (
    <EmptyState
      icon={BuildingApartmentIcon}
      title="No institution assigned"
      description={copy.noMembership}
    />
  );
}
