import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, linesPerPage, missingInputs, slotsFor } from "@/lib/studio";

describe("slotsFor", () => {
  it("Text → Assignment ON hides the source card; OFF requires it", () => {
    expect(slotsFor("clone", true).map((s) => s.slot)).toEqual(["reference", "paper"]);
    expect(slotsFor("clone", false).map((s) => s.slot)).toEqual(["source", "reference", "paper"]);
    expect(slotsFor("clone", false).find((s) => s.slot === "source")?.required).toBe(true);
  });
  it("edit mode has an optional reference; digital mode is source-only and never images", () => {
    expect(slotsFor("edit", true).find((s) => s.slot === "reference")?.required).toBe(false);
    const digital = slotsFor("digital", false);
    expect(digital).toHaveLength(1);
    expect(digital[0].accept).not.toContain("png");
  });
});

describe("missingInputs", () => {
  it("lists required uploads and text", () => {
    expect(missingInputs("edit", true, {}, "")).toEqual(["Original assignment", "Instruction"]);
    expect(missingInputs("clone", true, { reference: 1 }, "")).toEqual(["Assignment content"]);
    expect(missingInputs("clone", true, { reference: 1 }, "Aim: test")).toEqual([]);
  });
});

describe("linesPerPage", () => {
  it("fits the ruled area of an A4 page", () => {
    expect(linesPerPage(DEFAULT_LAYOUT)).toBe(31); // (297 - 30 - 15) / 8
    expect(linesPerPage({ ...DEFAULT_LAYOUT, pageSize: "Letter" })).toBeLessThan(31);
  });
});

describe("convert mode", () => {
  it("needs both assignments but no instruction", () => {
    const slots = slotsFor("convert", true);
    expect(slots.map((s) => [s.slot, s.required])).toEqual([
      ["source", true],
      ["reference", true],
    ]);
    expect(slots.find((s) => s.slot === "reference")?.accept).not.toContain("docx");
    expect(missingInputs("convert", true, { source: 1 }, "")).toEqual(["Assignment 2 — handwriting"]);
    expect(missingInputs("convert", true, { source: 1, reference: 1 }, "")).toEqual([]);
  });
});
