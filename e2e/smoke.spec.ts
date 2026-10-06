import { expect, test } from "@playwright/test";

test("home page loads with the expected title and no server error", async ({ page }) => {
  const response = await page.goto("/");

  expect(response).not.toBeNull();
  expect(response?.ok()).toBe(true);

  await expect(page).toHaveTitle("Scholars Student Management System");
});
