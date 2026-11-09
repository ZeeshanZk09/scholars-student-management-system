/**
 * Institution System Settings Page (`PRD.md` MODULE 32, `RULES.md` §37).
 *
 * Centralized configuration across institute, academic, fee, salary, attendance,
 * notification, email, security, and general application categories.
 */

import { getInstitutionSettings } from "@/modules/governance";
import { SettingsEditor } from "@/modules/governance/ui/settings-editor";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function SettingsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="settings.manage"
      title="System Settings"
      description="Configure institution parameters, academic criteria, billing rules, and security policies."
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Administration" }, { label: "Settings" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to manage system settings for this institution."
      empty={{
        chooseInstitution: "Choose an institution above to configure its system parameters.",
        noInstitution: "No institution is available to configure.",
        noMembership: "You are not affiliated with an institution yet.",
      }}
      render={async ({ institution }) => {
        const settings = await getInstitutionSettings(institution.id);

        return (
          <SettingsEditor
            institutionId={institution.id}
            initialSettings={settings}
          />
        );
      }}
    />
  );
}
