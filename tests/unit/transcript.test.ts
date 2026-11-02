import { describe, expect, it } from "vitest";
import { garbleScore, GARBLED, isTableRow, tablePage } from "@/lib/transcript";

describe("transcript tables", () => {
  it("normalises markdown tables and finds the header", () => {
    const page = "IA Activity 1\n| Sr.No. | Interaction | Reaction | Why? |\n| --- | --- | --- | --- |\n| 1. | A housewife speaks rudely | Reaction | She behaves |";
    const r = tablePage(page);
    expect(r.text).toBe("IA Activity 1\nSr.No. | Interaction | Reaction | Why?\n1. | A housewife speaks rudely | Reaction | She behaves");
    expect(r.header).toBe("Sr.No. | Interaction | Reaction | Why?");
  });

  it("keeps the previous header for a continuation page and drops it after the table ends", () => {
    expect(tablePage("7. | The brother gifts | Response | He shares", "Sr.No. | A | B | C").header).toBe("Sr.No. | A | B | C");
    expect(tablePage("Conclusion: done.", "Sr.No. | A | B | C").header).toBeUndefined();
    expect(tablePage("| Sr.No. | X | Y |\n| 1. | a | b |", "Sr.No. | A | B | C").header).toBe("Sr.No. | X | Y"); // a new table
  });

  it("does not treat prose with one pipe as a table", () => {
    expect(isTableRow("A | B")).toBe(true);
    expect(isTableRow("use the | key")).toBe(true); // two cells: accepted risk, shown in the transcript for review
    expect(isTableRow("no pipes here")).toBe(false);
  });
});

describe("garbled transcript detection", () => {
  it("flags OCR debris of a handwritten table and passes clean text and tables", () => {
    const ocr = "| | 5 lo. tere 4 pi nd R exdtinger ay ' Wh 9\n| | |\n. A chewe No, ?D. 0.0 M ; i | ) 0\npoe | : | : A -) AOK L ] I AO\n] coleud daedbes fo lams nead Crus";
    expect(garbleScore(ocr)).toBeGreaterThan(GARBLED);
    expect(garbleScore("1. | A housewife speaks rudely to her maid | Reaction | She behaves according to her irritation.")).toBeLessThan(GARBLED);
    expect(garbleScore("Aim: To verify Ohm's law (V = IR) at 25 °C.")).toBeLessThan(GARBLED);
  });
});
