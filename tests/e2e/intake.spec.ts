import { expect, test } from "@playwright/test";
import path from "node:path";

const fx = (f: string) => path.join(__dirname, "..", "fixtures", f);

test.describe("document intake", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop covers intake; mobile layout is covered by shell tests.");

  test("digital PDF: previews, pages, extracted text, fonts and manual plan", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/studio");
    await page.locator('input[type="file"]').first().setInputFiles(fx("digital-2page.pdf"));
    await expect(page.getByRole("img", { name: "Original, page 1" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Digital text")).toBeVisible();
    await expect(page.getByText("2 pages")).toBeVisible();
    await expect(page.getByText("Name: Aditya Kulkarni")).toBeVisible();
    await page.getByRole("button", { name: "Page 2" }).click();
    await expect(page.getByRole("img", { name: "Original, page 2" })).toBeVisible();
    await expect(page.getByText("Conclusion: Current varies linearly with voltage.")).toBeVisible();
    await page.getByText(/^Fonts \(/).click();
    await expect(page.getByText(/BitstreamVeraSans/)).toBeVisible();

    // Manual fallback works without any AI call.
    await page.getByLabel("Find exactly").fill("Experiment No. 3");
    await page.getByLabel(/Replace with/).fill("Experiment No. 4");
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();
    await expect(page.getByText("ambiguous")).toBeVisible(); // appears on both pages
    await page.getByLabel("Choose which occurrence to change").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Use this" }).click();
    await expect(page.getByRole("button", { name: "Apply 1 change" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("DOCX: renders preview and lists paragraphs and table cells", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "Digital Studio" }).click();
    await page.locator('input[type="file"]').first().setInputFiles(fx("lab-report.docx"));
    await expect(page.locator(".docx-preview").first()).toContainText("Verification of Ohm", { timeout: 20_000 });
    const side = page.getByRole("complementary", { name: "Side panel" });
    await expect(side.getByText("PRN: 22010173")).toBeVisible();
    await expect(side.getByText("4.2", { exact: true })).toBeVisible();
  });

  test("scanned ruled page: local OCR with handwriting heuristic, convert transcript", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/studio");
    await page.getByRole("button", { name: "Convert Handwriting" }).click();
    await page.locator('input[type="file"]').first().setInputFiles(fx("ruled-page.png"));
    const transcript = page.getByLabel("Transcript", { exact: true });
    await expect(transcript).toBeVisible({ timeout: 120_000 });
    await expect(transcript).toHaveValue(/Experiment/i);
    await expect(page.getByLabel("I have checked this transcript")).not.toBeChecked();
  });

  test("encrypted-looking or corrupt PDF is rejected with a useful message", async ({ page }) => {
    await page.goto("/studio");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nthis is not really a pdf") });
    await expect(page.getByRole("alert").filter({ hasText: /corrupt|could not be read/ }).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("live Groq planning", () => {
  test.skip(({ isMobile }) => isMobile || !process.env.GROQ_LIVE, "Set GROQ_LIVE=1 to run against the real API.");

  test("plans a name change on the digital PDF", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/studio");
    await expect(page.getByText("AI: Groq ready")).toBeVisible({ timeout: 20_000 });
    await page.locator('input[type="file"]').first().setInputFiles(fx("digital-2page.pdf"));
    await expect(page.getByRole("img", { name: "Original, page 1" })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(/Send document text to Groq/).check();
    await page.getByLabel("Describe the change").fill("Replace the name with Sahil Karande");
    await page.getByRole("button", { name: /Plan changes/ }).click();
    await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator("ins").filter({ hasText: "Sahil Karande" })).toBeVisible();
  });
});
