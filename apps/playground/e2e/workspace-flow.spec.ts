import { expect, test } from "@playwright/test";

test("new workspaces start with general and random channels", async ({ page }) => {
  const email = `bebop-${Date.now()}@example.test`;

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Create the first admin?" })).toBeVisible();
  await page.getByRole("button", { name: "Create first admin" }).click();
  await page.locator("#bebop-admin-name").fill("Playwright Admin");
  await page.locator("#bebop-admin-email").fill(email);
  await page.locator("#bebop-admin-password").fill("playwright-password");
  await page.getByRole("button", { name: "Create first admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create your first workspace" })).toBeVisible();
  await page.locator('summary[aria-label^="Switch workspace"]').click();
  await page.getByRole("button", { name: "Add workspace" }).click();
  await page.locator("#workspace-name").fill("Workspace Alpha");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  for (const channelName of ["general", "random"]) {
    await expect(page.getByRole("button", { name: channelName, exact: true })).toBeVisible();
  }

  await page.goto("/admin/collections/channels");
  for (const channelName of ["general", "random"]) {
    const row = page.getByRole("row").filter({ hasText: channelName }).filter({ hasText: "Workspace Alpha" });
    await expect(row).toBeVisible();
  }

  await page.goto("/admin/collections/streamMemberships");
  for (const channelName of ["general", "random"]) {
    const row = page.getByRole("row").filter({ hasText: `${channelName} Channel stream` });
    await expect(row.getByText("Admin", { exact: true })).toBeVisible();
  }
});
