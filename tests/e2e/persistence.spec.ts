// Persistence on the Neon dev branch (playwright.config injects .env.test.local into the server).
import path from "node:path";
import { expect, test } from "@playwright/test";

const fx = (f: string) => path.join(__dirname, "..", "fixtures", f);

test.describe("accounts", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("studio pages redirect to sign-in; wrong password is refused; APIs need a session", async ({ page, request }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary/);
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password").fill("definitely-not-it");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    expect((await request.get("/api/projects")).status()).toBe(401);
    expect((await request.get("/api/worker/status")).status()).toBe(401);
    expect((await request.get("/api/groq/status")).status()).toBe(401);
    expect((await request.post("/api/plan", { headers: { origin: "http://localhost:3100" }, data: {} })).status()).toBe(401);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // landing stays public
  });
});

test.describe("saved projects", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop flow.");
  test.setTimeout(180_000);

  test("autosave, reload restores file + version + settings; library rename, duplicate, delete", async ({ page }) => {
    const name = `E2E project ${Date.now()}`;
    await page.goto("/studio");
    await expect(page.getByText("Not saved yet")).toBeVisible();
    await page.getByLabel("Project name").fill(name);
    await page.locator('input[type="file"]').first().setInputFiles(fx("digital-2page.pdf"));
    await expect(page).toHaveURL(/\?project=[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });

    // Apply an edit; it becomes a stored version.
    await expect(page.getByRole("img", { name: "Original, page 1" })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Find exactly").fill("Aditya Kulkarni");
    await page.getByLabel(/Replace with/).fill("Sahil Karande");
    await page.getByRole("button", { name: "Add to plan" }).click();
    await page.getByRole("button", { name: /^Apply 1 change$/ }).click();
    await expect(page.getByText("Version 1 of 1 · native")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Describe the change").fill("Keep this instruction after reload");
    await page.waitForTimeout(1500);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });

    // Reload: everything comes back from Neon + object storage.
    await page.reload();
    await expect(page.getByLabel("Project name")).toHaveValue(name, { timeout: 30_000 });
    await expect(page.getByText("Version 1 of 1 · native")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("img", { name: "Original, page 1" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Describe the change")).toHaveValue("Keep this instruction after reload");
    await expect(page.getByRole("complementary", { name: "Side panel" }).getByText("Name: Sahil Karande")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("No edits applied yet")).toBeVisible();

    // Library: search, rename, duplicate, delete.
    await page.goto("/library");
    await page.getByLabel("Search projects").fill(name);
    const card = page.getByRole("listitem").filter({ hasText: name });
    await expect(card).toHaveCount(1, { timeout: 30_000 });
    await expect(card.getByText(/1 version/)).toBeVisible();
    await card.getByRole("button", { name: `Rename ${name}` }).click();
    await page.getByLabel("Project name").fill(`${name} renamed`);
    await page.getByRole("button", { name: "Save" }).click();
    const renamed = page.getByRole("listitem").filter({ hasText: `${name} renamed` });
    await expect(renamed).toHaveCount(1, { timeout: 30_000 });
    await renamed.getByRole("button", { name: /^Duplicate/ }).click();
    const copy = page.getByRole("listitem").filter({ hasText: `${name} renamed (copy)` });
    await expect(copy).toHaveCount(1, { timeout: 30_000 });
    for (const label of [`${name} renamed (copy)`, `${name} renamed`]) {
      await page.getByRole("listitem").filter({ hasText: label }).first().getByRole("button", { name: `Delete ${label}` }).click();
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: new RegExp(`^${label.replace(/[()]/g, "\\$&")}`) })).toHaveCount(0, { timeout: 30_000 });
    }
    await expect(page.getByText("No projects match.")).toBeVisible();
  });
});
