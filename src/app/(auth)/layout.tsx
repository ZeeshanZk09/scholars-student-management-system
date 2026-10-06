/**
 * Shell for the public authentication pages: a centred card, no application chrome.
 *
 * Deliberately carries *no* session logic — every page in this group must work while logged
 * out. The redirect-to-login enforcement lives in `src/proxy.ts` (optimistic) and
 * `src/app/(app)/layout.tsx` (authoritative), never here.
 */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
