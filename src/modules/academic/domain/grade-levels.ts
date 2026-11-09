/**
 * The academic levels an institution's classes are drawn from (`PRD.md` MODULE 4).
 *
 * `grade_level` on `classes` is the 0-based sort key so "Class 10" sorts after "Class 2"; this
 * module is the source of that mapping. Nursery is 0 and Class 12 is 12, so a grade level is also
 * "the year after Nursery", which is how promotion arithmetic reasons about it.
 */
export const GRADE_LEVEL_NAMES = [
  "Nursery",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
] as const;

export type GradeLevelName = (typeof GRADE_LEVEL_NAMES)[number];

/** 0-based grade level, indexed by name. */
const GRADE_LEVEL_ORDINAL: Readonly<Record<GradeLevelName, number>> = {
  Nursery: 0,
  "Class 1": 1,
  "Class 2": 2,
  "Class 3": 3,
  "Class 4": 4,
  "Class 5": 5,
  "Class 6": 6,
  "Class 7": 7,
  "Class 8": 8,
  "Class 9": 9,
  "Class 10": 10,
  "Class 11": 11,
  "Class 12": 12,
};

/** The grade level name of the Nth year (0-indexed), or `null` beyond Class 12. */
export function gradeLevelName(gradeLevel: number): GradeLevelName | null {
  return GRADE_LEVEL_NAMES[gradeLevel] ?? null;
}

/** The 0-based ordinal of a named grade level, or `null` for a non-standard name. */
export function gradeLevelOrdinal(name: string): number | null {
  const key = name.trim().replace(/\s+/g, " ");
  return GRADE_LEVEL_ORDINAL[key as GradeLevelName] ?? null;
}

/** All known grade levels, ordered (the select options of a class form). */
export const KNOWN_GRADE_LEVELS: readonly {
  readonly ordinal: number;
  readonly name: GradeLevelName;
}[] = GRADE_LEVEL_NAMES.map((name, ordinal) => ({ ordinal, name }));
