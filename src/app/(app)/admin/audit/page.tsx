/**
 * Audit Trail Compliance Page (`PRD.md` MODULE 31, `ARCHITECTURE.md` §30).
 *
 * Permanent, immutable logging of important operations across fees, salaries, marks,
 * attendance, permissions, and institution setting overrides.
 */

import { queryAuditTrail } from "@/modules/governance";
import { AuditTrailViewer } from "@/modules/governance/ui/audit-trail-viewer";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function AuditTrailPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="audit.view"
      title="Audit Trail"
      description="Permanent, immutable audit logs for operational transparency and governance compliance."
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Administration" }, { label: "Audit Trail" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view audit logs for this institution."
      empty={{
        chooseInstitution: "Choose an institution above to inspect its compliance audit trail.",
        noInstitution: "No institution is available to view audit records.",
        noMembership: "You are not affiliated with an institution yet.",
      }}
      render={async ({ institution }) => {
        const auditLog = await queryAuditTrail({
          institutionId: institution.id,
          limit: 100,
        });

        return (
          <AuditTrailViewer
            initialRecords={auditLog.items}
            totalRecords={auditLog.total}
          />
        );
      }}
    />
  );
}
