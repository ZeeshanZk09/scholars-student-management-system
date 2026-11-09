# Lenis Smooth Scroll Integration

When using Lenis for smooth scrolling in a Next.js/React project, use the `ReactLenis` component from `lenis/react` instead of manually initializing Lenis with `useEffect`/`useRef`.

## Why the ReactLenis wrapper works

The `ReactLenis` component properly wraps page content and enables smooth scrolling by taking over native scroll behavior while maintaining accessibility (anchor links, `position: sticky`, keyboard navigation). The original approach of manually creating a Lenis instance but returning `null` from the component caused the "stuck" scroll behavior because Lenis had no DOM element to attach to.

## When to use this pattern

- Next.js/React projects using Lenis for smooth scrolling
- Any component that needs to provide smooth page scrolling
- Replacing manual `new Lenis()` + `useEffect` initializations

## Implementation

```tsx
"use client";

import { ReactLenis } from "lenis/react";

export default function SmoothScrollProvider() {
  return (
    <ReactLenis
      options={{
        duration: 1.4,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 2,
      }}
    />
  );
}
```

## Configuration options

| Option | Default | Description |
|--------|---------|-------------|
| `duration` | `1.2` | Scroll animation duration in seconds |
| `easing` | `(t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))` | Easing function for scroll animation |
| `smoothWheel` | `true` | Enable smooth wheel scrolling |
| `wheelMultiplier` | `1` | Multiplier for wheel events |
| `touchMultiplier` | `2` | Multiplier for touch events |

## What NOT to do

- ❌ Do NOT manually initialize Lenis with `new Lenis()` inside `useEffect`
- ❌ Do NOT return `null` from a component that creates a Lenis instance — Lenis needs a wrapper element
- ❌ Do NOT mix GSAP ScrollTrigger with Lenis unless you explicitly synchronize them (`lenis.on('scroll', ScrollTrigger.update)`)
- ❌ Do NOT add unnecessary `setTimeout` delays before Lenis initialization

## Integration points

This provider should be placed at the root layout level (e.g., `(public)/layout.tsx`) to wrap the entire page content. The component renders `<ReactLenis />` which creates the Lenis instance that takes over native scrolling for the entire document.

## Verification

- Run `npm run typecheck` — TypeScript should pass with no errors
- Run `npm run build` — Next.js build should compile successfully
- Test on multiple devices/browsers to confirm smooth scrolling works
- Verify anchor links still navigate correctly
- Confirm `position: sticky` elements work as expected