import { expect, test } from "@playwright/test";

test("site is up: the login page serves with the expected title and no server error", async ({
  page,
}) => {
  // Phase 3 made `/` a protected surface — `src/proxy.ts` plus the (app) layout's
  // `requireSession` redirect an anonymous visitor to `/login`. The smoke test therefore probes
  // the anonymous entrypoint: request `/`, follow the redirect, and confirm the final landing
  // page (`/login`) renders with its own title and no 5xx.
  const response = await page.goto("/");

  expect(response).not.toBeNull();
  expect(response?.ok()).toBe(true);

  await expect(page).toHaveTitle("Sign in");
  await expect(page.getByText("Sign in to continue")).toBeVisible();
});
