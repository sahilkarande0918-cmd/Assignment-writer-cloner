import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fx = (f: string) => path.join(__dirname, "..", "fixtures", f);
const verify = (file: string) => JSON.parse(execFileSync("python", ["-I", "scripts/verify_exports.py", file], { encoding: "utf8" }))[file];

async function manualEdit(page: Page, find: string, replace: string) {
  await page.getByLabel("Find exactly").fill(find);
  await page.getByLabel(/Replace with/).fill(replace);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await page.getByRole("button", { name: /^Apply 1 change$/ }).click();
}

async function exportAs(page: Page, format: string, out: string) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("radio", { name: new RegExp(`^${format}`) }).check({ force: true });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Export (PDF|PNG|JPEG|DOCX|TXT|Markdown)$/ }).click()]);
  const file = path.join("test-results", "downloads", out);
  await dl.saveAs(file);
  await page.getByRole("button", { name: "Close" }).first().click();
  return file;
}

test.describe("deterministic editing", () => {
  test.skip(({ isMobile }) => isMobile, "Editing flows are exercised on desktop.");

  test("digital PDF: native edit with original font, verified, diff, undo/redo, PDF + PNG export", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/studio");
    await page.locator('input[type="file"]').first().setInputFiles(fx("digital-2page.pdf"));
    await expect(page.getByRole("img", { name: "Original, page 1" })).toBeVisible({ timeout: 30_000 });
    await manualEdit(page, "Aditya Kulkarni", "Sahil Karande");

    const report = page.getByRole("region", { name: "What changed" });
    await expect(report.getByText("Native edit")).toBeVisible({ timeout: 30_000 });
    await expect(report.getByText("verified", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(report.getByText("original font")).toBeVisible();
    await expect(page.getByText("Version 1 of 1 · native")).toBeVisible();

    await page.getByRole("button", { name: "Diff" }).click();
    await expect(page.getByText(/% of pixels changed on this page/)).toBeVisible();
    const pct = parseFloat((await page.getByText(/% of pixels changed/).textContent())!);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(1); // only the name changed
    await page.getByRole("button", { name: "Diff" }).click();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("No edits applied yet")).toBeVisible();
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByText("Version 1 of 1 · native")).toBeVisible();

    const pdf = verify(await exportAs(page, "PDF", "edited.pdf"));
    expect(pdf.pages).toBe(2);
    expect(pdf.text).toContain("Sahil Karande");
    expect(pdf.text).not.toContain("Aditya");
    const png = verify(await exportAs(page, "PNG", "edited-png.zip"));
    expect(Object.keys(png.members)).toHaveLength(2);
  });

  test("DOCX: run-level table edit, verified, DOCX export keeps header and footer", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/studio");
    await page.getByRole("button", { name: "Digital Studio" }).click();
    await page.locator('input[type="file"]').first().setInputFiles(fx("lab-report.docx"));
    await expect(page.getByRole("complementary", { name: "Side panel" }).getByText("PRN: 22010173")).toBeVisible({ timeout: 20_000 });
    await manualEdit(page, "4.2", "4.7");
    await expect(page.getByRole("region", { name: "What changed" }).getByText("verified", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Diff" }).click();
    await expect(page.getByRole("list", { name: "Text changes" })).toContainText("4.7");

    // PDF from DOCX is honestly unavailable in the browser.
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByText(/needs LibreOffice/)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).first().click();

    const file = await exportAs(page, "DOCX", "edited.docx");
    const d = verify(file);
    expect(d.cells).toContain("4.7");
    expect(d.cells).not.toContain("4.2");
    const header = execFileSync("python", ["-I", "-c", `import docx,sys; d=docx.Document(sys.argv[1]); print(d.sections[0].header.paragraphs[0].text + "|" + d.sections[0].footer.paragraphs[0].text)`, file], { encoding: "utf8" });
    expect(header.trim()).toBe("Department of Electrical Engineering|Lab manual - confidential");
  });

  test("scanned page: reconstruction is labelled as not exact", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/studio");
    await page.locator('input[type="file"]').first().setInputFiles(fx("ruled-page.png"));
    const side = page.getByRole("complementary", { name: "Side panel" });
    await expect(side.getByText("Scan / photo")).toBeVisible({ timeout: 150_000 });
    const line = (await side.getByText(/Experiment/).first().textContent())!.trim();
    await manualEdit(page, line, "Experiment No. 5");
    const report = page.getByRole("region", { name: "What changed" });
    await expect(report.getByText("Reconstruction — not exact")).toBeVisible({ timeout: 60_000 });
    await expect(report.getByText(/erased and redrawn/)).toBeVisible();
  });
});
