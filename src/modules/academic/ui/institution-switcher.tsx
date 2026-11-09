"use client";

/**
 * Pick the institution the academic pages should read.
 *
 * Only rendered when there is a *choice* — a platform administrator with several tenants, or a
 * principal whose URL named none. The selection lives in the query string rather than in session
 * state, so the address bar always names the tenant whose data is on screen and a link to "this
 * institution's classes" can be pasted to someone else (`SECURITY.md` §22: verify the context,
 * never trust a stored claim).
 *
 * `value` comes from the server's *resolved* institution, not from `searchParams`, so the control
 * shows what is actually being displayed even when the URL carried no parameter.
 */
import { usePathname, useRouter } from "next/navigation";

import { FormField } from "@/components/shared/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface InstitutionSwitcherProps {
  readonly institutions: readonly { readonly id: string; readonly name: string }[];
  readonly value: string;
}

export function InstitutionSwitcher({ institutions, value }: Readonly<InstitutionSwitcherProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const items = Object.fromEntries(
    institutions.map((institution) => [institution.id, institution.name]),
  );

  return (
    <FormField label="Institution" htmlFor="institution-switcher" className="min-w-48">
      <Select
        items={items}
        value={value === "" ? null : value}
        onValueChange={(next) => {
          const id = Array.isArray(next) ? (next[0] ?? "") : (next ?? "");
          if (id.length > 0) {
            router.replace(`${pathname}?institution=${encodeURIComponent(id)}`, { scroll: false });
          }
        }}
      >
        <SelectTrigger id="institution-switcher" className="w-full">
          <SelectValue placeholder="Select an institution" />
        </SelectTrigger>
        <SelectContent>
          {institutions.map((institution) => (
            <SelectItem key={institution.id} value={institution.id}>
              {institution.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
