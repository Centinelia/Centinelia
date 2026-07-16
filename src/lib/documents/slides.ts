import PptxGenJS from 'pptxgenjs';

export interface Slide {
  title:    string;
  content:  string;
  notes?:   string;
}

export interface SlidesOptions {
  title:         string;
  slides:        Slide[];
  businessName?: string;
  accentColor?:  string; // hex with or without #
}

export async function generateSlides(opts: SlidesOptions): Promise<Buffer> {
  const { title, slides, businessName, accentColor } = opts;
  const accent = (accentColor ?? '#6C3BFF').replace(/^#/, '');

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 16:9

  // ── Title slide ───────────────────────────────────────────────────────────
  const cover = pptx.addSlide();
  cover.background = { color: accent };
  cover.addText(title, {
    x: 0.5, y: 1.8, w: 12, h: 1.5,
    fontSize:  40,
    bold:      true,
    color:     'FFFFFF',
    align:     'center',
    fontFace:  'Calibri',
  });
  if (businessName) {
    cover.addText(businessName, {
      x: 0.5, y: 3.5, w: 12, h: 0.6,
      fontSize: 18,
      color:    'FFFFFF',
      align:    'center',
      italic:   true,
      fontFace: 'Calibri',
    });
  }
  cover.addText(new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }), {
    x: 0.5, y: 6.8, w: 12, h: 0.4,
    fontSize: 12,
    color:    'DDDDDD',
    align:    'center',
    fontFace: 'Calibri',
  });

  // ── Content slides ────────────────────────────────────────────────────────
  for (const slide of slides) {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };

    // Accent bar top
    s.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 13.33, h: 0.12,
      fill: { color: accent },
      line: { color: accent },
    });

    // Title
    s.addText(slide.title, {
      x: 0.5, y: 0.3, w: 12.3, h: 0.9,
      fontSize: 26,
      bold:     true,
      color:    accent,
      fontFace: 'Calibri',
    });

    // Divider
    s.addShape(pptx.ShapeType.line, {
      x: 0.5, y: 1.25, w: 12.3, h: 0,
      line: { color: `${accent}55`, width: 1 },
    });

    // Content — parse bullet lines
    const lines = slide.content.split('\n').filter(l => l.trim() !== '');
    const textItems: PptxGenJS.TextProps[] = [];

    for (const line of lines) {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        textItems.push({
          text:     line.slice(2),
          options:  { bullet: true, fontSize: 16, color: '333333', breakLine: true, paraSpaceAfter: 6 },
        });
      } else if (line.startsWith('## ')) {
        textItems.push({
          text:    line.slice(3),
          options: { bold: true, fontSize: 18, color: accent, breakLine: true, paraSpaceAfter: 4 },
        });
      } else {
        textItems.push({
          text:    line,
          options: { fontSize: 16, color: '333333', breakLine: true, paraSpaceAfter: 4 },
        });
      }
    }

    if (textItems.length > 0) {
      s.addText(textItems, {
        x: 0.5, y: 1.4, w: 12.3, h: 5.3,
        valign:  'top',
        fontFace: 'Calibri',
      });
    }

    // Slide number (bottom right)
    s.addText(`${slides.indexOf(slide) + 1} / ${slides.length}`, {
      x: 11.5, y: 7.1, w: 1.5, h: 0.3,
      fontSize: 10,
      color:    'AAAAAA',
      align:    'right',
      fontFace: 'Calibri',
    });

    if (slide.notes) s.addNotes(slide.notes);
  }

  return pptx.write({ outputType: 'nodebuffer' }) as Promise<Buffer>;
}
