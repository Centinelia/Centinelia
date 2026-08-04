import PptxGenJS from 'pptxgenjs';

export interface Slide {
  title:    string;
  content:  string;
  notes?:   string;
}

export interface LogoAsset {
  dataUrl:  string;   // data:image/png;base64,...
  widthPx:  number;   // dimensiones reales para preservar aspect ratio
  heightPx: number;
}

export interface SlidesOptions {
  title:            string;
  slides:           Slide[];
  businessName?:    string;
  accentColor?:     string;                  // hex con o sin #
  accentSecondary?: string | null;           // hex — opcional, para acentos secundarios
  logo?:            LogoAsset | null;        // logo con dimensiones reales; sin él, pptxgenjs deforma la imagen
}

/**
 * Ajusta un logo a un bounding box preservando aspect ratio (letterbox).
 * Devuelve las dimensiones de dibujo + coordenadas centradas en el box.
 */
function fitLogo(logo: LogoAsset, boxX: number, boxY: number, boxW: number, boxH: number): { x: number; y: number; w: number; h: number } {
  const aspect = logo.widthPx / logo.heightPx;
  let drawW = boxW, drawH = boxW / aspect;
  if (drawH > boxH) { drawH = boxH; drawW = boxH * aspect; }
  return {
    x: boxX + (boxW - drawW) / 2,
    y: boxY + (boxH - drawH) / 2,
    w: drawW,
    h: drawH,
  };
}

// Layout wide (13.33" x 7.5"). Constantes con nombre para leer más fácil.
const W = 13.33;
const H = 7.5;

// Convierte "#6C3BFF" o "6C3BFF" a "6C3BFF".
function hex(c: string): string {
  return (c || '').replace(/^#/, '').toUpperCase();
}

export async function generateSlides(opts: SlidesOptions): Promise<Buffer> {
  const { title, slides, businessName, accentColor, accentSecondary, logo } = opts;
  const accent    = hex(accentColor ?? '#6C3BFF');
  const secondary = hex(accentSecondary ?? '') || accent;
  const dateStr   = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  // ── Portada ───────────────────────────────────────────────────────────────
  // Fondo accent + banda diagonal en secondary para dar profundidad.
  const cover = pptx.addSlide();
  cover.background = { color: accent };

  // Banda diagonal decorativa (rombo/paralelogramo) esquina inferior derecha.
  cover.addShape(pptx.ShapeType.rtTriangle, {
    x: W - 5, y: H - 3, w: 5, h: 3,
    fill:     { color: secondary, transparency: 60 },
    line:     { type: 'none' },
    flipH:    true,
  });
  // Segunda banda más sutil.
  cover.addShape(pptx.ShapeType.rtTriangle, {
    x: 0, y: 0, w: 4, h: 2.4,
    fill:     { color: 'FFFFFF', transparency: 88 },
    line:     { type: 'none' },
  });

  // Logo top-center — dimensiones ajustadas al aspect ratio real. Box de 3.5"x1.4"
  // (grande para portada). Sin fitLogo, pptxgenjs estira la imagen y se ve distorsionada.
  if (logo) {
    const box = fitLogo(logo, W / 2 - 1.75, 0.55, 3.5, 1.4);
    cover.addImage({ data: logo.dataUrl, x: box.x, y: box.y, w: box.w, h: box.h });
  }

  // Título centrado.
  cover.addText(title, {
    x: 0.5, y: logo ? 2.5 : 2.0, w: W - 1, h: 1.6,
    fontSize:  44,
    bold:      true,
    color:     'FFFFFF',
    align:     'center',
    fontFace:  'Calibri',
  });

  // Business name subtitle (solo si NO hay logo, para no repetir).
  if (!logo && businessName) {
    cover.addText(businessName, {
      x: 0.5, y: 4.2, w: W - 1, h: 0.6,
      fontSize: 20,
      color:    'FFFFFF',
      align:    'center',
      italic:   true,
      fontFace: 'Calibri',
    });
  }

  // Barra separadora corta debajo del título.
  cover.addShape(pptx.ShapeType.rect, {
    x: W / 2 - 0.4, y: logo ? 4.25 : 4.9, w: 0.8, h: 0.06,
    fill: { color: 'FFFFFF' },
    line: { type: 'none' },
  });

  // Fecha al fondo.
  cover.addText(dateStr, {
    x: 0.5, y: H - 0.7, w: W - 1, h: 0.4,
    fontSize: 12,
    color:    'F0F0F0',
    align:    'center',
    fontFace: 'Calibri',
  });

  // ── Slides de contenido ───────────────────────────────────────────────────
  slides.forEach((slide, idx) => {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };

    // Ribbon vertical izquierdo en accent color (marca visual constante).
    s.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.35, h: H,
      fill: { color: accent },
      line: { type: 'none' },
    });

    // Header bar sutil (parte superior derecha) con secondary tenue.
    s.addShape(pptx.ShapeType.rect, {
      x: 0.35, y: 0, w: W - 0.35, h: 1.1,
      fill: { color: secondary, transparency: 92 },
      line: { type: 'none' },
    });

    // Logo en esquina superior derecha del header bar (si existe). Aspect-preserving.
    if (logo) {
      const box = fitLogo(logo, W - 1.5, 0.15, 1.3, 0.8);
      s.addImage({ data: logo.dataUrl, x: box.x, y: box.y, w: box.w, h: box.h });
    }

    // Título en accent.
    s.addText(slide.title, {
      x: 0.75, y: 0.25, w: logo ? W - 2.5 : W - 1.5, h: 0.85,
      fontSize: 28,
      bold:     true,
      color:    accent,
      fontFace: 'Calibri',
      valign:   'middle',
    });

    // Línea divisoria fina.
    s.addShape(pptx.ShapeType.line, {
      x: 0.75, y: 1.2, w: W - 1.5, h: 0,
      line: { color: accent, width: 1.5 },
    });

    // Contenido — parseamos bullets.
    const lines = slide.content.split('\n').filter(l => l.trim() !== '');
    const textItems: PptxGenJS.TextProps[] = [];

    for (const line of lines) {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        textItems.push({
          text:    line.slice(2),
          options: {
            bullet:         { code: '25CF' },  // círculo sólido
            fontSize:       18,
            color:          '2A2A3F',
            breakLine:      true,
            paraSpaceAfter: 10,
            indentLevel:    0,
          },
        });
      } else if (line.startsWith('## ')) {
        textItems.push({
          text:    line.slice(3),
          options: {
            bold:           true,
            fontSize:       20,
            color:          accent,
            breakLine:      true,
            paraSpaceAfter: 6,
          },
        });
      } else {
        textItems.push({
          text:    line,
          options: {
            fontSize:       17,
            color:          '2A2A3F',
            breakLine:      true,
            paraSpaceAfter: 6,
          },
        });
      }
    }

    if (textItems.length > 0) {
      s.addText(textItems, {
        x: 0.9, y: 1.55, w: W - 1.65, h: H - 2.5,
        valign:   'top',
        fontFace: 'Calibri',
      });
    }

    // Footer bar sutil.
    s.addShape(pptx.ShapeType.line, {
      x: 0.35, y: H - 0.55, w: W - 0.35, h: 0,
      line: { color: accent, width: 0.5, transparency: 60 },
    });

    // Business name footer left.
    if (businessName) {
      s.addText(businessName, {
        x: 0.75, y: H - 0.5, w: 6, h: 0.35,
        fontSize: 10,
        color:    '888888',
        fontFace: 'Calibri',
      });
    }

    // Slide number footer right.
    s.addText(`${idx + 1} / ${slides.length}`, {
      x: W - 1.5, y: H - 0.5, w: 1.2, h: 0.35,
      fontSize: 10,
      color:    accent,
      bold:     true,
      align:    'right',
      fontFace: 'Calibri',
    });

    if (slide.notes) s.addNotes(slide.notes);
  });

  return pptx.write({ outputType: 'nodebuffer' }) as Promise<Buffer>;
}
