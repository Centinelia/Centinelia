# -*- coding: utf-8 -*-
"""Generate 5 KYB PDFs + ZIP from markdown source."""
import os
import re
import zipfile
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

SRC = r"C:\Users\Nazre\centinelia\demos\meefi-gac\16-kyb-comercializadora-bajio-DEMO.md"
OUT_DIR = r"C:\Users\Nazre\centinelia\demos\meefi-gac\kyb-bajio"
ZIP_PATH = r"C:\Users\Nazre\centinelia\demos\meefi-gac\kyb-bajio.zip"

FILENAMES = [
    "01-acta-constitutiva.pdf",
    "02-rfc.pdf",
    "03-comprobante-domicilio.pdf",
    "04-opinion-sat-32d.pdf",
    "05-poder-general.pdf",
]

os.makedirs(OUT_DIR, exist_ok=True)


def parse_markdown(path):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    # find each "## Documento N · Title" section
    pattern = re.compile(r"^## Documento (\d+) [··] (.+?)$", re.MULTILINE)
    matches = list(pattern.finditer(text))
    sections = []
    for i, m in enumerate(matches):
        num = int(m.group(1))
        title = m.group(2).strip()
        start = m.end()
        # next boundary is next "## " heading
        # find the next top-level "## " after start
        next_h = re.search(r"^## ", text[start:], re.MULTILINE)
        end = start + next_h.start() if next_h else len(text)
        body = text[start:end].strip()
        # strip horizontal rule --- at end
        body = re.sub(r"\n---\s*$", "", body).strip()
        sections.append((num, title, body))
    return sections


def parse_body_lines(body):
    """Return list of (kind, text) tuples where kind is one of:
    'title-header' (unused here), 'subheader' (bold **text**),
    'bullet', 'text', 'blank', 'preformatted_line'
    We treat code fences as preformatted content (rendered as normal lines but preserving spacing/indent).
    """
    lines = body.split("\n")
    out = []
    in_fence = False
    for raw in lines:
        line = raw.rstrip("\r")
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            # preserve leading spaces as-is; treat as preformatted
            if line.strip() == "":
                out.append(("blank", ""))
            else:
                out.append(("pre", line))
            continue
        # non-fenced markdown
        stripped = line.strip()
        if stripped == "":
            out.append(("blank", ""))
            continue
        # subheader: entire line wrapped in ** ... **
        m = re.match(r"^\*\*(.+)\*\*:?\s*$", stripped)
        if m:
            out.append(("subheader", m.group(1).strip()))
            continue
        # bullet
        if stripped.startswith("- "):
            out.append(("bullet", stripped[2:].strip()))
            continue
        # regular paragraph line
        # strip inline ** ** just in case
        cleaned = re.sub(r"\*\*(.+?)\*\*", r"\1", stripped)
        out.append(("text", cleaned))
    return out


class PDFBuilder:
    def __init__(self, path, title):
        self.path = path
        self.title = title
        self.c = canvas.Canvas(path, pagesize=LETTER)
        self.width, self.height = LETTER
        self.margin = 2 * cm
        self.x = self.margin
        self.y = self.height - self.margin
        self.line_h_body = 10 * 1.15  # 11.5 pt
        self.line_h_sub = 13
        self.body_font = "Helvetica"
        self.body_size = 10
        self.mono_font = "Courier"
        self.mono_size = 9
        self.pages = []  # placeholder — we'll track via c.getPageNumber but need total for footer
        # We build content into a list first, then render for total page count.
        self._draw_ops = []  # list of ('op', args)

    # ---- pass 1: layout & record operations without drawing footer ----
    def _need_space(self, needed):
        if self.y - needed < self.margin + 1.2 * cm:  # leave room for footer
            self._draw_ops.append(("newpage",))
            self.y = self.height - self.margin

    def _wrap(self, text, font, size, max_width):
        """Wrap text into lines that fit max_width, preserving words."""
        if text == "":
            return [""]
        words = text.split(" ")
        lines = []
        cur = ""
        for w in words:
            trial = w if cur == "" else cur + " " + w
            if pdfmetrics.stringWidth(trial, font, size) <= max_width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                # if single word too long, break it hard
                if pdfmetrics.stringWidth(w, font, size) > max_width:
                    # hard break by chars
                    chunk = ""
                    for ch in w:
                        if pdfmetrics.stringWidth(chunk + ch, font, size) <= max_width:
                            chunk += ch
                        else:
                            if chunk:
                                lines.append(chunk)
                            chunk = ch
                    cur = chunk
                else:
                    cur = w
        if cur:
            lines.append(cur)
        return lines

    def add_title(self):
        self._need_space(20)
        self._draw_ops.append(("text", self.x, self.y, self.title, "Helvetica-Bold", 14))
        self.y -= 14 * 1.4
        # small gap
        self.y -= 6

    def add_subheader(self, text):
        self._need_space(self.line_h_sub + 6)
        self.y -= 6  # spacing before
        self._draw_ops.append(("text", self.x, self.y, text, "Helvetica-Bold", 11))
        self.y -= self.line_h_sub

    def add_text(self, text):
        max_w = self.width - 2 * self.margin
        lines = self._wrap(text, self.body_font, self.body_size, max_w)
        for ln in lines:
            self._need_space(self.line_h_body)
            self._draw_ops.append(("text", self.x, self.y, ln, self.body_font, self.body_size))
            self.y -= self.line_h_body

    def add_bullet(self, text):
        indent = 12
        bullet_x = self.x
        text_x = self.x + indent
        max_w = self.width - 2 * self.margin - indent
        lines = self._wrap(text, self.body_font, self.body_size, max_w)
        first = True
        for ln in lines:
            self._need_space(self.line_h_body)
            if first:
                self._draw_ops.append(("text", bullet_x, self.y, "•", self.body_font, self.body_size))
                first = False
            self._draw_ops.append(("text", text_x, self.y, ln, self.body_font, self.body_size))
            self.y -= self.line_h_body

    def add_pre_line(self, raw):
        """Render a preformatted line using Courier to preserve alignment."""
        # If line has too many chars to fit at mono_size, shrink font per-line
        max_w = self.width - 2 * self.margin
        # measure
        size = self.mono_size
        while size >= 6 and pdfmetrics.stringWidth(raw, self.mono_font, size) > max_w:
            size -= 0.5
        line_h = size * 1.2
        self._need_space(line_h)
        self._draw_ops.append(("text", self.x, self.y, raw, self.mono_font, size))
        self.y -= line_h

    def add_blank(self, h=None):
        h = h if h is not None else self.line_h_body
        self._need_space(h)
        self.y -= h

    # ---- pass 2: render ops to actual canvas, with pagination + footer ----
    def render(self):
        # First, split ops into pages by walking through
        pages = [[]]
        for op in self._draw_ops:
            if op[0] == "newpage":
                pages.append([])
            else:
                pages[-1].append(op)
        total = len(pages)
        for pi, ops in enumerate(pages, start=1):
            for op in ops:
                _, x, y, txt, font, size = op
                self.c.setFont(font, size)
                self.c.drawString(x, y, txt)
            # footer
            self.c.setFont("Helvetica", 8)
            footer = f"Página {pi} de {total}"
            fw = pdfmetrics.stringWidth(footer, "Helvetica", 8)
            self.c.drawString((self.width - fw) / 2, self.margin / 2, footer)
            self.c.showPage()
        self.c.save()


def build_pdf(path, title, body):
    pb = PDFBuilder(path, title)
    pb.add_title()
    items = parse_body_lines(body)
    # collapse leading blanks
    while items and items[0][0] == "blank":
        items.pop(0)
    prev = None
    for kind, val in items:
        if kind == "blank":
            # avoid excessive blank stacking
            if prev == "blank":
                continue
            pb.add_blank(pb.line_h_body * 0.6)
        elif kind == "subheader":
            pb.add_subheader(val)
        elif kind == "bullet":
            pb.add_bullet(val)
        elif kind == "pre":
            pb.add_pre_line(val)
        else:
            pb.add_text(val)
        prev = kind
    pb.render()


def main():
    sections = parse_markdown(SRC)
    if len(sections) != 5:
        raise RuntimeError(f"Expected 5 sections, found {len(sections)}")
    generated = []
    for (num, title, body), fname in zip(sections, FILENAMES):
        out_path = os.path.join(OUT_DIR, fname)
        build_pdf(out_path, title, body)
        size = os.path.getsize(out_path)
        generated.append((fname, size, title))
        print(f"OK  {fname}  {size} bytes  title={title!r}")
    # ZIP with flat paths
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname, _, _ in generated:
            zf.write(os.path.join(OUT_DIR, fname), arcname=fname)
    zsize = os.path.getsize(ZIP_PATH)
    print(f"ZIP {ZIP_PATH}  {zsize} bytes")


if __name__ == "__main__":
    main()
