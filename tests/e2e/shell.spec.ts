import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = ["/", "/studio", "/library", "/login"];

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

for (const route of ROUTES) {
  test(`${route} renders without console errors, overflow or serious a11y issues`, async ({ page }) => {
    const errors = trackConsole(page);
    await page.goto(route);
    await expect(page.locator("main#main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Let entrance animations finish so contrast is measured on the settled page.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
    await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "horizontal page scroll").toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("reduced motion skips the WebGL hero", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForTimeout(800);
  await expect(page.locator("canvas")).toHaveCount(0);
  await ctx.close();
});

test("Text → Assignment toggle swaps between new document and source edit", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Handwriting Clone" }).click();
  await expect(page.getByRole("heading", { name: "Reference handwriting" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source to edit" })).toHaveCount(0);
  await expect(page.getByLabel("Assignment content")).toBeVisible();
  await page.getByRole("switch", { name: "Text → Assignment" }).click();
  await expect(page.getByRole("heading", { name: "Source to edit" })).toBeVisible();
  await expect(page.getByLabel("Assignment content")).toHaveCount(0);
});

test("upload card rejects an executable and accepts a PNG", async ({ page }) => {
  await page.goto("/studio");
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\u0090\u0000 this is not a pdf") });
  await expect(page.getByText(/^Unsupported or unrecognised/)).toBeVisible();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await input.setInputFiles({ name: "page.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("page.png")).toBeVisible();
  await expect(page.getByRole("img", { name: "Original, page 1" })).toBeVisible({ timeout: 60_000 });
});

test("planning stays disabled and explains why", async ({ page }) => {
  await page.goto("/studio");
  const plan = page.getByRole("button", { name: /Plan changes/ });
  await expect(plan).toBeDisabled();
  await expect(page.getByText("Add: Original assignment, Instruction.")).toBeVisible();
});

test("Convert Handwriting asks for both assignments and explains the pipeline", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Convert Handwriting" }).click();
  await expect(page.getByRole("heading", { name: "Assignment 1 — content" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assignment 2 — handwriting" })).toBeVisible();
  await expect(page.getByText("Add: Assignment 1 — content, Assignment 2 — handwriting.")).toBeVisible();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles({ name: "a1.png", mimeType: "image/png", buffer: png });
  await inputs.nth(1).setInputFiles({ name: "a2.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Both assignments are in place.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Plan conversion/ })).toBeDisabled();
});
