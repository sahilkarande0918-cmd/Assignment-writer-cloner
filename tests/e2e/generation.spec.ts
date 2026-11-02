// LIVE generation through the real job API and the local GPU worker. Opt-in: GENERATE_LIVE=1, with
// `workers/handwriting/worker.py` polling this server (HW_API_URL=http://localhost:3100).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";

const fx = (f: string) => path.join(__dirname, "..", "fixtures", f);

test.describe("handwriting generation (live worker)", () => {
  test.skip(({ isMobile }) => isMobile || !process.env.GENERATE_LIVE, "Set GENERATE_LIVE=1 and run the GPU worker.");
  test.setTimeout(300_000);

  test("Text → Assignment: queue, generate, regenerate a line, download PDF", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "Handwriting Clone" }).click();
    await page.locator('input[type="file"]').first().setInputFiles(fx("ruled-page.png"));
    await page
      .getByLabel("Assignment content")
      .fill(
        "Experiment No. 6\nAim: To study a simple pendulum and measure its period at 25°C.\n\nObservation: the error was under 2% for every length, so g = 9.8 m/s² (see table [1] @ lab).\n\nResult: The period depends on the length, not on the mass of the bob.",
      );
    await expect(page.getByText("GPU worker online")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Generate pages" }).click();
    const panel = page.getByRole("region", { name: "Generate handwriting" });
    // Live progress from the worker heartbeat: a real percentage and stage, not an animation.
    await expect(panel.getByRole("progressbar")).toHaveAttribute("aria-valuetext", /^\d+% — Writing words/, { timeout: 120_000 });
    await expect(panel.getByText("Generated", { exact: true })).toBeVisible({ timeout: 240_000 });
    await expect(panel.getByText("Generated handwriting")).toBeVisible();
    await expect(panel.getByText("No overlaps or clipping")).toBeVisible();
    await expect(panel.getByText(/Word check \(trocr-small-handwritten, best of 3\)/)).toBeVisible();
    await expect(panel.getByText(/Drawn from a handwriting font.*%.*°/)).toBeVisible(); // symbols written, not refused
    await expect(page.getByRole("img", { name: "Generated handwriting, page 1" })).toBeVisible();
    await page.screenshot({ path: "test-results/screens/generation-desktop.png", fullPage: true });
    await page.getByLabel("Preview layer").selectOption("paper");
    await expect(page.getByRole("img", { name: "Generated handwriting, page 1, paper layer" })).toBeVisible();
    await page.getByLabel("Preview layer").selectOption("ink");
    await expect(page.getByRole("img", { name: "Generated handwriting, page 1, ink layer" })).toBeVisible();
    await page.getByLabel("Preview layer").selectOption("composite");

    await panel.getByText("Lines — regenerate a bad one").click();
    await panel.getByRole("button", { name: "Regenerate line 2 on page 1" }).click();
    await expect(panel.getByText("Generated", { exact: true })).toBeVisible({ timeout: 240_000 });

    const [dl] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download PDF" }).click()]);
    const file = path.join("test-results", "downloads", "handwritten.pdf");
    await dl.saveAs(file);
    const v = JSON.parse(execFileSync("python", ["-I", "scripts/verify_exports.py", file], { encoding: "utf8" }))[file];
    expect(v).toMatchObject({ type: "pdf", pages: 1 });
  });

  test("Convert Handwriting: assignment 1 text in assignment 2's style, after transcript confirmation", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "Convert Handwriting" }).click();
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles(fx("digital-2page.pdf"));
    await inputs.nth(1).setInputFiles(fx("ruled-page.png"));
    const transcript = page.getByLabel("Transcript", { exact: true });
    await expect(transcript).toHaveValue(/Aditya Kulkarni/, { timeout: 60_000 });
    // Keep it short for the test: only the first two lines of assignment 1.
    await transcript.fill("Experiment No. 3: Verification of Ohm's Law\nName: Aditya Kulkarni");
    const generate = page.getByRole("button", { name: "Generate pages" });
    await expect(generate).toBeDisabled(); // transcript not confirmed yet
    await page.getByLabel("I have checked this text").check();
    await generate.click();
    const panel = page.getByRole("region", { name: "Generate handwriting" });
    await expect(panel.getByText("Generated", { exact: true })).toBeVisible({ timeout: 240_000 });
    await expect(page.getByRole("img", { name: "Generated handwriting, page 1" })).toBeVisible();
  });
});

test("no GPU worker: the job is queued and the studio says why (no fake progress)", async ({ page, isMobile }) => {
  test.skip(isMobile || !!process.env.GENERATE_LIVE, "Runs only when no worker is polling.");
  await page.goto("/studio");
  await page.getByRole("button", { name: "Handwriting Clone" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(fx("ruled-page.png"));
  await page.getByLabel("Assignment content").fill("Short test.");
  const panel = page.getByRole("region", { name: "Generate handwriting" });
  await expect(panel.getByText(/GPU worker offline|GPU: disabled/)).toBeVisible({ timeout: 20_000 });
  await panel.getByRole("button", { name: "Generate pages" }).click();
  await expect(panel.getByText("Waiting for a GPU worker", { exact: true })).toBeVisible({ timeout: 30_000 });
  const bar = panel.getByRole("progressbar", { name: "Generation progress" });
  await expect(bar).toHaveAttribute("aria-valuetext", /Waiting for a GPU worker/); // indeterminate: no invented percentage
  await expect(bar).not.toHaveAttribute("aria-valuenow", /.+/);
  await expect(panel.getByText(/of 3 free generations left/)).toBeVisible();
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByText("Cancelled")).toBeVisible();
});
