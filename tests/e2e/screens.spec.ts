// Visual snapshots for manual review (written to test-results/screens). Run: SCREENS=1 npx playwright test screens
import { expect, test } from "@playwright/test";
import path from "node:path";

test.skip(!process.env.SCREENS, "Set SCREENS=1 to capture review screenshots.");

test("studio with a loaded PDF and a plan", async ({ page }, info) => {
  await page.goto("/studio");
  await page.locator('input[type="file"]').first().setInputFiles(path.join(__dirname, "..", "fixtures", "digital-2page.pdf"));
  await expect(page.getByRole("img", { name: "Original, page 1" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Find exactly").fill("Aditya Kulkarni");
  await page.getByLabel(/Replace with/).fill("Sahil Karande");
  await page.getByRole("button", { name: "Add to plan" }).click();
  await page.screenshot({ path: `test-results/screens/studio-pdf-${info.project.name}.png`, fullPage: true });
});
