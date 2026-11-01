"""Generate synthetic QA fixtures (no real student data).

Usage: python scripts/make_fixtures.py
Outputs to tests/fixtures/:
  digital-2page.pdf   embedded TrueType font (Bitstream Vera, redistributable), ruled table, 2 pages
  lab-report.docx     header/footer, paragraphs, a 3x3 table
  ruled-page.png      'scanned' notebook page: blue rules, red margin, handwriting-style text
"""
import os
from pathlib import Path

import reportlab
from docx import Document
from docx.shared import Pt
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)


def pdf():
    vera = Path(reportlab.__file__).parent / "fonts" / "Vera.ttf"
    pdfmetrics.registerFont(TTFont("Vera", str(vera)))
    c = canvas.Canvas(str(OUT / "digital-2page.pdf"), pagesize=A4)
    w, h = A4
    c.setFont("Vera", 16)
    c.drawString(72, h - 72, "Experiment No. 3: Verification of Ohm's Law")
    c.setFont("Vera", 12)
    lines = ["Name: Aditya Kulkarni", "PRN: 22010173", "Date: 03/10/2026", "Aim: To verify Ohms law using a fixed resistor."]
    for i, t in enumerate(lines):
        c.drawString(72, h - 110 - i * 20, t)
    # Table with visible borders: these strokes must survive edits.
    top, rows, cols, cw, rh = h - 220, 4, 3, 120, 22
    for r in range(rows + 1):
        c.line(72, top - r * rh, 72 + cols * cw, top - r * rh)
    for k in range(cols + 1):
        c.line(72 + k * cw, top, 72 + k * cw, top - rows * rh)
    data = [["Sr. No.", "Voltage (V)", "Current (A)"], ["1", "2.0", "0.20"], ["2", "4.2", "0.41"], ["3", "6.1", "0.60"]]
    for r, row in enumerate(data):
        for k, cell in enumerate(row):
            c.drawString(72 + k * cw + 6, top - r * rh - 15, cell)
    c.line(72, 60, w - 72, 60)
    c.drawString(w / 2 - 20, 44, "Page 1")
    c.showPage()
    c.setFont("Vera", 12)
    c.drawString(72, h - 72, "Result: Ohm's law is verified for Experiment No. 3.")
    c.drawString(72, h - 92, "Conclusion: Current varies linearly with voltage.")
    c.line(72, 60, w - 72, 60)
    c.drawString(w / 2 - 20, 44, "Page 2")
    c.save()


def docx():
    d = Document()
    d.sections[0].header.paragraphs[0].text = "Department of Electrical Engineering"
    d.sections[0].footer.paragraphs[0].text = "Lab manual - confidential"
    d.add_heading("Experiment No. 3: Verification of Ohm's Law", level=1)
    p = d.add_paragraph("Name: ")
    p.add_run("Aditya Kulkarni").bold = True
    d.add_paragraph("PRN: 22010173")
    d.add_paragraph("Theory: Ohm's law states that current is directly proportinal to voltage.").runs[0].font.size = Pt(11)
    t = d.add_table(rows=3, cols=3)
    t.style = "Table Grid"
    for r, row in enumerate([["Sr. No.", "Voltage (V)", "Current (A)"], ["1", "2.0", "0.20"], ["2", "4.2", "0.41"]]):
        for k, v in enumerate(row):
            t.cell(r, k).text = v
    d.add_paragraph("Conclusion: Current varies linearly with voltage.")
    d.save(OUT / "lab-report.docx")


def png():
    W, H = 1240, 1754  # A4 at 150 dpi
    img = Image.new("RGB", (W, H), (252, 250, 244))
    g = ImageDraw.Draw(img)
    for y in range(180, H - 80, 52):
        g.line([(0, y), (W, y)], fill=(170, 196, 222), width=2)
    g.line([(150, 0), (150, H)], fill=(214, 120, 120), width=3)
    font_path = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", "Inkfree.ttf")
    font = ImageFont.truetype(font_path, 40) if os.path.exists(font_path) else ImageFont.load_default(40)
    text = ["Experiment No. 4", "Name: Aditya Kulkarni", "Aim: To study the diode", "characteristics in forward bias.", "Result: Graph is plotted."]
    for i, t in enumerate(text):
        g.text((175, 180 + i * 52 - 44), t, font=font, fill=(32, 48, 92))
    img.save(OUT / "ruled-page.png", optimize=True)


if __name__ == "__main__":
    pdf()
    docx()
    png()
    for f in sorted(OUT.iterdir()):
        print(f.name, f.stat().st_size)
