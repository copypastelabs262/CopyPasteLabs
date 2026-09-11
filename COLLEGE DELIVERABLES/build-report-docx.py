"""
Markdown -> Word converter applying MPSTME Annexure A.8 report formatting.

A.8 rules implemented:
  1  Times New Roman throughout          2  Line spacing 1.5
  3  Left margin 1.5"                    4  All other margins 1"
  5  Header right: academic year         6  Header left: project title
  7  Footer right: page number           8  Chapter titles 18pt bold
  9  Section titles 14pt bold           10  Subsection titles 12pt bold
 11  Figure captions 10pt (below)       12  Table captions 10pt (above)
 13  Body text 12pt                     18  Front matter page nos. Roman
 19  Chapter 1 onward decimal
"""
import re
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

FONT = "Times New Roman"
BODY = Pt(12)
CHAPTER = Pt(18)
SECTION = Pt(14)
SUBSECTION = Pt(12)
CAPTION = Pt(10)

# Headings that begin the decimal-numbered part of the report.
BODY_START = "Chapter 1"


def set_cell_border(cell):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:color"), "808080")
        borders.append(el)
    tcPr.append(borders)


def add_field(paragraph, instr):
    """Insert a Word field code (used for PAGE numbers)."""
    run = paragraph.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "begin")
    run._r.append(fld)

    run = paragraph.add_run()
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = instr
    run._r.append(it)

    run = paragraph.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "end")
    run._r.append(fld)


def set_page_numbering(section, fmt, start=None):
    sectPr = section._sectPr
    existing = sectPr.find(qn("w:pgNumType"))
    if existing is not None:
        sectPr.remove(existing)
    el = OxmlElement("w:pgNumType")
    el.set(qn("w:fmt"), fmt)
    if start is not None:
        el.set(qn("w:start"), str(start))
    sectPr.append(el)


def style_run(run, size=BODY, bold=False, italic=False, color=None):
    run.font.name = FONT
    run.font.size = size
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    # Ensure Devanagari and other complex scripts also resolve to a real font.
    rFonts.set(qn("w:ascii"), FONT)
    rFonts.set(qn("w:hAnsi"), FONT)
    rFonts.set(qn("w:cs"), "Nirmala UI")


INLINE = re.compile(r"(\*\*\*.+?\*\*\*|\*\*.+?\*\*|(?<!\*)\*(?!\*).+?(?<!\*)\*(?!\*)|`.+?`|\[\d+\])")


def add_inline(paragraph, text, size=BODY, base_bold=False, color=None):
    """Render **bold**, *italic*, `code` and [n] citations inside a paragraph."""
    text = text.replace("\\_", "_").replace("\\*", "*")
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("***") and part.endswith("***"):
            style_run(paragraph.add_run(part[3:-3]), size, True, True, color)
        elif part.startswith("**") and part.endswith("**"):
            style_run(paragraph.add_run(part[2:-2]), size, True, False, color)
        elif part.startswith("*") and part.endswith("*"):
            style_run(paragraph.add_run(part[1:-1]), size, base_bold, True, color)
        elif part.startswith("`") and part.endswith("`"):
            r = paragraph.add_run(part[1:-1])
            r.font.name = "Consolas"
            r.font.size = Pt(10)
            r._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), "Consolas")
        else:
            style_run(paragraph.add_run(part), size, base_bold, False, color)


def new_paragraph(doc, spacing=1.5, before=0, after=6, align=None, indent=None):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.line_spacing = spacing
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    if align is not None:
        p.alignment = align
    if indent is not None:
        pf.left_indent = Inches(indent)
    return p


def is_table_row(line):
    return line.strip().startswith("|") and line.strip().endswith("|")


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def convert(md_path, docx_path, project_title, academic_year):
    with open(md_path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")

    doc = Document()

    # --- base style -------------------------------------------------------
    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = BODY
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    normal.paragraph_format.line_spacing = 1.5

    sec = doc.sections[0]
    sec.left_margin = Inches(1.5)
    sec.right_margin = Inches(1)
    sec.top_margin = Inches(1)
    sec.bottom_margin = Inches(1)
    set_page_numbering(sec, "lowerRoman", start=1)
    build_header_footer(sec, project_title, academic_year)

    state = {"in_body": False, "pending_caption": None}
    i = 0
    first_heading_done = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # ---- fenced code block ------------------------------------------
        if stripped.startswith("```"):
            i += 1
            block = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1
            for bl in block:
                p = new_paragraph(doc, spacing=1.0, after=0, indent=0.3)
                r = p.add_run(bl)
                r.font.name = "Consolas"
                r.font.size = Pt(9)
                r._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), "Consolas")
            new_paragraph(doc, after=6)
            continue

        # ---- tables ------------------------------------------------------
        if is_table_row(line):
            rows = []
            while i < len(lines) and is_table_row(lines[i]):
                rows.append(split_row(lines[i]))
                i += 1
            # drop the |---|---| separator row
            rows = [r for r in rows if not all(set(c) <= set("-: ") and c for c in r)]
            if rows:
                add_table(doc, rows, state)
            continue

        # ---- headings ----------------------------------------------------
        m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if m:
            level, text = len(m.group(1)), m.group(2).strip()
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)

            if level == 1:
                # Front-matter ends where Chapter 1 begins.
                if text.startswith(BODY_START) and not state["in_body"]:
                    state["in_body"] = True
                    ns = doc.add_section(WD_SECTION.NEW_PAGE)
                    ns.left_margin = Inches(1.5)
                    ns.right_margin = Inches(1)
                    ns.top_margin = Inches(1)
                    ns.bottom_margin = Inches(1)
                    ns.header.is_linked_to_previous = False
                    ns.footer.is_linked_to_previous = False
                    set_page_numbering(ns, "decimal", start=1)
                    build_header_footer(ns, project_title, academic_year)
                elif first_heading_done:
                    doc.add_page_break()
                first_heading_done = True
                p = new_paragraph(doc, before=12, after=18, align=WD_ALIGN_PARAGRAPH.CENTER)
                add_inline(p, text, CHAPTER, base_bold=True)
                for r in p.runs:
                    r.bold = True
            elif level == 2:
                p = new_paragraph(doc, before=18, after=8)
                add_inline(p, text, SECTION, base_bold=True)
                for r in p.runs:
                    r.bold = True
            else:
                p = new_paragraph(doc, before=12, after=6)
                add_inline(p, text, SUBSECTION, base_bold=True)
                for r in p.runs:
                    r.bold = True
            i += 1
            continue

        # ---- horizontal rule --------------------------------------------
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", stripped):
            i += 1
            continue

        # ---- blockquote (kept as a visible drafting note) ----------------
        if stripped.startswith(">"):
            block = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                block.append(lines[i].strip().lstrip(">").strip())
                i += 1
            text = " ".join(b for b in block if b)
            if text:
                p = new_paragraph(doc, indent=0.4, before=6, after=6)
                add_inline(p, text, BODY, color=RGBColor(0x44, 0x44, 0x44))
                for r in p.runs:
                    r.italic = True
            continue

        # ---- checklist / bullets ----------------------------------------
        m = re.match(r"^[-*]\s+\[([ xX])\]\s+(.*)$", stripped)
        if m:
            p = new_paragraph(doc, after=2, indent=0.3)
            style_run(p.add_run("☐  "), BODY)
            add_inline(p, m.group(2), BODY)
            i += 1
            continue

        m = re.match(r"^[-*]\s+(.*)$", stripped)
        if m:
            p = new_paragraph(doc, after=3, indent=0.3)
            style_run(p.add_run("•  "), BODY)
            add_inline(p, m.group(1), BODY)
            i += 1
            continue

        m = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if m:
            p = new_paragraph(doc, after=3, indent=0.3)
            style_run(p.add_run(f"{m.group(1)}.  "), BODY)
            add_inline(p, m.group(2), BODY)
            i += 1
            continue

        # ---- blank ------------------------------------------------------
        if not stripped:
            i += 1
            continue

        # ---- body paragraph (join wrapped lines) -------------------------
        buf = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (not nxt or nxt.startswith("#") or nxt.startswith(">")
                    or is_table_row(lines[i]) or nxt.startswith("```")
                    or re.match(r"^[-*]\s+", nxt) or re.match(r"^\d+\.\s+", nxt)
                    or re.match(r"^(-{3,}|\*{3,}|_{3,})$", nxt)):
                break
            buf.append(nxt)
            i += 1
        text = " ".join(buf)

        # A caption line immediately preceding a table, e.g. "**Table 2.1** ..."
        if re.match(r"^\*\*(Table|Fig)", text):
            state["pending_caption"] = text
            continue

        p = new_paragraph(doc, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
        add_inline(p, text, BODY)

    doc.save(docx_path)
    return docx_path


def build_header_footer(section, project_title, academic_year):
    hp = section.header.paragraphs[0]
    hp.text = ""
    hp.paragraph_format.tab_stops.add_tab_stop(
        Inches(6.0), WD_TAB_ALIGNMENT.RIGHT)
    style_run(hp.add_run(project_title), Pt(10))
    style_run(hp.add_run("\t"), Pt(10))
    style_run(hp.add_run(academic_year), Pt(10))

    fp = section.footer.paragraphs[0]
    fp.text = ""
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    add_field(fp, "PAGE")
    for r in fp.runs:
        style_run(r, Pt(10))


def add_table(doc, rows, state):
    caption = state.get("pending_caption")
    if caption:
        p = new_paragraph(doc, before=10, after=3)
        add_inline(p, caption, CAPTION)
        state["pending_caption"] = None

    ncols = max(len(r) for r in rows)
    table = doc.add_table(rows=0, cols=ncols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    try:
        table.style = "Table Grid"
    except KeyError:
        pass
    table.autofit = True

    for ri, row in enumerate(rows):
        cells = table.add_row().cells
        for ci in range(ncols):
            val = row[ci] if ci < len(row) else ""
            cell = cells[ci]
            cell.text = ""
            p = cell.paragraphs[0]
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            add_inline(p, val, Pt(10), base_bold=(ri == 0))
            if ri == 0:
                for r in p.runs:
                    r.bold = True
            set_cell_border(cell)

    new_paragraph(doc, after=8)


if __name__ == "__main__":
    src, dst, title, year = sys.argv[1:5]
    out = convert(src, dst, title, year)
    print(f"Wrote {out}")
