"""Reopen exported files with independent readers and print a JSON report.

Usage: python -I scripts/verify_exports.py <file> [<file> ...]
PDF -> PyMuPDF (pages, text, page size), DOCX -> python-docx (paragraphs), PNG/JPEG -> Pillow (size, dpi),
ZIP -> each member verified as above, TXT/MD -> UTF-8 decode.
"""
import io
import json
import sys
import zipfile


def check(name: str, data: bytes) -> dict:
    low = name.lower()
    if low.endswith(".pdf"):
        import fitz

        d = fitz.open(stream=data, filetype="pdf")
        return {"type": "pdf", "pages": d.page_count, "size": [round(d[0].rect.width, 1), round(d[0].rect.height, 1)], "text": "\n".join(p.get_text() for p in d)}
    if low.endswith(".docx"):
        import docx

        d = docx.Document(io.BytesIO(data))
        return {"type": "docx", "paragraphs": [p.text for p in d.paragraphs], "tables": len(d.tables), "cells": [c.text for t in d.tables for r in t.rows for c in r.cells]}
    if low.endswith((".png", ".jpg", ".jpeg")):
        from PIL import Image

        im = Image.open(io.BytesIO(data))
        im.verify()
        return {"type": im.format.lower(), "size": list(im.size)}
    if low.endswith(".zip"):
        z = zipfile.ZipFile(io.BytesIO(data))
        return {"type": "zip", "members": {n: check(n, z.read(n)) for n in z.namelist()}}
    return {"type": "text", "text": data.decode("utf-8")}


if __name__ == "__main__":
    print(json.dumps({p: check(p, open(p, "rb").read()) for p in sys.argv[1:]}))
