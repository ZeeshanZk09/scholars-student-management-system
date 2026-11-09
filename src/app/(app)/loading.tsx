import { PageLoader } from "@/components/shared/loading-state";

/** The `(app)` route segment's streaming fallback (`PHASES.md` §13 task 10). */
export default function Loading() {
  return <PageLoader label="Loading workspace" />;
}
