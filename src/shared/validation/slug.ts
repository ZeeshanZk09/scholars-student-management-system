/**
 * Slug minting, shared by every module that stores a `slug(…)` column.
 *
 * The rule is the same wherever it appears — lowercase, hyphenated ASCII, collision-free inside its
 * owning scope — so it lives here rather than being re-authored per module. It moved here from
 * `src/modules/academic/domain/domain-rules.ts` when a second module (students, Phase 7 task 14)
 * needed it; that module re-exports nothing of its own and keeps a single import.
 *
 * Uniqueness is always **scoped by the caller**: the service passes the slugs of the rows that
 * share the scope (one institution, one parent) and this function only chooses a free candidate.
 * It never queries anything, so it stays unit-testable without a database.
 */

/** Lowercase, hyphenated ASCII slug for a display name. Falls back to "item" for empty input. */
export function slugify(source: string): string {
  const normalized = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized.length > 0 ? normalized.slice(0, 120) : "item";
}

/** The first slug candidate in `candidates` not already used; falls back to `base-2`, `-3`, … */
export function uniqueSlug(base: string, existing: readonly string[]): string {
  const used = new Set(existing);
  const stem = slugify(base).slice(0, 108);
  if (!used.has(stem)) return stem;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}`;
}
