/**
 * Institution configuration (`PHASES.md` Phase 6, tasks 1 and 13 — institute context + admin UI).
 *
 * Two cards, not a modal: this is the page an administrator returns to, so the current values stay
 * visible next to the form that edits them rather than being hidden behind a click. The
 * optimistic-concurrency `version` travels with the form, so two administrators editing at once
 * fail loudly instead of silently clobbering each other.
 *
 * "Add institution" is a **platform** action (`requirePlatformPermission` in
 * `createInstitutionAction`) — minting a tenant is the platform acting, not a tenant acting on
 * itself — so the button renders only for a principal that holds `academic.manage` at platform
 * scope. The page still gates on `academic.manage` through the shared frame.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CreateInstitutionDialog,
  UpdateInstitutionForm,
} from "@/modules/academic/ui/institution-forms";

import { AcademicPage } from "./_lib/academic-page";

export default async function InstitutionPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Institution"
      description="The tenant every academic record belongs to, and which tenant this session is acting in."
      searchParams={searchParams}
      actions={(ctx) => (ctx.isPlatformAdmin ? <CreateInstitutionDialog /> : null)}
      render={({ institution }) => (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {institution.name}
                <Badge variant="secondary">{institution.kind}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <Detail label="Code" value={institution.code} />
                <Detail label="Contact email" value={institution.email} />
                <Detail label="Phone" value={institution.phone} />
                <Detail label="Website" value={institution.website} />
                <Detail label="Address" value={institution.address} />
                <Detail label="Campuses" value={String(institution.campusCount)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Edit institution</CardTitle>
              <CardDescription>
                Saved changes apply to every module that reads this tenant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UpdateInstitutionForm institution={institution} />
            </CardContent>
          </Card>
        </div>
      )}
    />
  );
}

/** A label/value pair that stays quiet when there is nothing to say. */
function Detail({ label, value }: Readonly<{ label: string; value: string | null }>) {
  if (value === null || value.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-32 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
