import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

/**
 * Guards the class-merging contract the UI components rely on:
 * non-conflicting classes accumulate, conflicting Tailwind utilities
 * resolve to the last one, and falsy values are dropped.
 */
describe("cn", () => {
  it("keeps non-conflicting classes", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center");
  });

  it("resolves conflicting utilities in favour of the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy and conditional values", () => {
    expect(cn("p-2", false && "hidden", null, undefined)).toBe("p-2");
  });
});
