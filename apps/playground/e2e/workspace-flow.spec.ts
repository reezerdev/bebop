import { expect, test } from "@playwright/test";

test("signup, workspace switching, inferred task workspace, and admin workspace editing", async ({ page }) => {
  test.setTimeout(180_000);
  const unique = `${Date.now()}`;
  const email = `bebop-${unique}@example.test`;

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Create the first admin?" })).toBeVisible();
  await page.getByRole("button", { name: "Create first admin" }).click();
  await page.locator("#bebop-admin-name").fill("Playwright Admin");
  await page.locator("#bebop-admin-email").fill(email);
  await page.locator("#bebop-admin-password").fill("playwright-password");
  await page.getByRole("button", { name: "Create first admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Make something/ })).toBeVisible();

  const workspaceForm = page.locator(".playground-composer > form").first();
  const taskForm = page.locator("form.playground-task-form");
  await workspaceForm.locator("#workspace-name").fill("Workspace Alpha");
  await workspaceForm.getByRole("button", { name: /Create workspace/ }).click();
  await expect(page.locator("#selected-workspace")).toHaveValue(/.+/);
  const alphaId = await page.locator("#selected-workspace").inputValue();

  await taskForm.locator("#task-name").fill("Alpha task");
  await taskForm.locator("#task-content").fill("pagination-search-marker");
  await taskForm.getByRole("button", { name: /Create task/ }).click();
  await expect(page.getByRole("heading", { name: "Alpha task" })).toBeVisible();
  await expect(taskForm.getByText("Workspace", { exact: true })).toHaveCount(0);
  for (let index = 1; index <= 24; index += 1) {
    const taskName = `Alpha pagination task ${index}`;
    await taskForm.locator("#task-name").fill(taskName);
    await taskForm.getByRole("button", { name: /Create task/ }).click();
    await expect(page.getByRole("heading", { name: taskName })).toBeVisible();
  }

  await page.goto("/admin/collections/workspaceMemberships");
  const creatorMembership = page.getByRole("row").filter({ hasText: "Workspace Alpha" });
  await expect(creatorMembership.getByText("Admin", { exact: true })).toBeVisible();

  await page.goto("/");
  await workspaceForm.locator("#workspace-name").fill("Workspace Beta");
  await workspaceForm.getByRole("button", { name: /Create workspace/ }).click();
  await expect(page.locator("#selected-workspace option", { hasText: "Workspace Beta" })).toHaveCount(1);
  await expect(page.locator("#selected-workspace")).not.toHaveValue(alphaId);
  const betaId = await page.locator("#selected-workspace").inputValue();
  expect(betaId).not.toBe(alphaId);
  await expect(page.getByRole("heading", { name: "Alpha task" })).toHaveCount(0);
  await expect(page.locator("#task-parent").getByRole("option", { name: "Alpha task" })).toHaveCount(0);

  await taskForm.locator("#task-name").fill("Beta task");
  await taskForm.getByRole("button", { name: /Create task/ }).click();
  await expect(page.getByRole("heading", { name: "Beta task" })).toBeVisible();

  await page.locator("#selected-workspace").selectOption(alphaId);
  await expect(page.getByRole("heading", { name: "Alpha task" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beta task" })).toHaveCount(0);

  await page.goto("/admin/collections/tasks/create");
  const workspaceInput = page.getByRole("combobox", { name: /Workspace/ });
  await expect(workspaceInput).toBeVisible();
  await workspaceInput.click();
  await page.getByRole("option", { name: "Workspace Alpha" }).click();
  await page.locator("#field-name").fill("Admin-created task");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("link", { name: "Admin-created task" })).toBeVisible();
  await page.getByRole("link", { name: "Admin-created task" }).click();
  await expect(page.getByRole("combobox", { name: /Workspace/ })).toBeVisible();
  const editorUrl = page.url();
  await page.locator("#field-name").fill("Local draft");
  const remotePage = await page.context().newPage();
  await remotePage.goto(editorUrl);
  await remotePage.locator("#field-name").fill("Remote change");
  await remotePage.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This document changed elsewhere" })).toBeVisible();
  await expect(page.locator("#field-name")).toHaveValue("Local draft");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reload latest" }).click();
  await expect(page.locator("#field-name")).toHaveValue("Remote change");
  await page.locator("#field-name").fill("Admin-edited task");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: "Admin-edited task" })).toBeVisible();
  await remotePage.close();

  await page.goto("/admin/collections/tasks");
  await expect(page.getByText("1–10+", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("11–20+", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search by Name" }).fill("pagination-search-marker");
  await expect(page.getByRole("link", { name: "Alpha task" })).toBeVisible();
  await expect(page.getByText("1–1", { exact: true })).toBeVisible();
});
