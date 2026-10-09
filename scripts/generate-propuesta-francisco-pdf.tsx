/**
 * Genera PDF de propuesta comercial formal para Francisco Chapa (IPark).
 *
 * Branding Centinelia completo con los detalles finos de documentos oficiales:
 *   - Logo real + línea de accent morada en header
 *   - Caja "Preparado para" destacada con metadata del cliente
 *   - Tablas con header morado, filas alternadas, columnas equilibradas
 *   - Pricing boxes con border morado y acento visual
 *   - Espaciado consistente entre párrafos, listas y secciones
 *   - Headings con jerarquía clara (H1 morado, H2 ink, H3 morado accent)
 *   - Firma de aceptación al final
 *   - Footer con contacto en cada página
 *
 * Uso:
 *   npx tsx scripts/generate-propuesta-francisco-pdf.tsx
 *
 * Output:
 *   demos/ipark/13-propuesta-francisco-chapa.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStream, View, Text, Document, Page, Image, Font } from '@react-pdf/renderer';
import type { BrandKit } from '@/lib/brand/kit';

Font.registerHyphenationCallback((word: string) => [word]);

const INPUT_PATH  = path.resolve('demos/ipark/13-propuesta-francisco-chapa.md');
const OUTPUT_PATH = path.resolve('demos/ipark/13-propuesta-francisco-chapa.pdf');

const LOGO_PATH = path.resolve('public/logo.png');
const LOGO_DATA_URI = fs.existsSync(LOGO_PATH)
  ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
  : null;

const BRAND: BrandKit = {
  businessName:   'Centinelia',
  logoUrl:        LOGO_DATA_URI,
  color:          '#6C3BFF',
  colorSecondary: '#1A0A3B',
  phone:          '+52 811 280 3360',
  website:        'centinelia.mx',
  address:        'Monterrey, Nuevo León, México',
  footerText:     'Propuesta comercial · Confidencial',
};

const ACCENT = '#6C3BFF';
const INK = '#1A0A3B';
const MUTED = '#6b7280';
const LIGHT_BG = '#F7F5FF';
const LIGHT_BORDER = '#E0D5FF';
const SOFT_BG = '#F9FAFB';
const BORDER_GRAY = '#e5e7eb';

// ─── Inline parsing (bold **texto**) ──────────────────────────────────────────

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`${keyBase}-t-${key++}`}>{text.slice(lastIndex, match.index)}</Text>);
    }
    parts.push(
      <Text key={`${keyBase}-b-${key++}`} style={{ fontFamily: 'Helvetica-Bold' }}>
        {match[1]}
      </Text>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<Text key={`${keyBase}-t-${key++}`}>{text.slice(lastIndex)}</Text>);
  }
  return parts.length > 0 ? parts : [text];
}

// ─── Table renderer con columnas inteligentes ─────────────────────────────────

function renderMarkdownTable(lines: string[], keyBase: string): React.ReactNode {
  if (lines.length < 2) return null;
  const header = lines[0].split('|').map(c => c.trim()).filter(c => c.length > 0);
  const dataLines = lines.slice(2).filter(l => l.trim().length > 0);
  const rows = dataLines.map(l =>
    l.split('|').map(c => c.trim()).filter((_, i) => i < header.length + 1).slice(1)
  );

  // Heurística de widths según cantidad de columnas y contenido del header
  let colWidths: number[];
  if (header.length === 2) {
    colWidths = [35, 65];
  } else if (header.length === 3) {
    colWidths = [40, 30, 30];
  } else if (header.length === 4) {
    // Si parece tabla de precios (contiene "Monto" o "Mensualidad"), ponderar hacia descripción
    const isPrice = header.some(h => /mont|precio|mensual|inversión/i.test(h));
    const isActionItems = header[0].trim() === '#';
    if (isActionItems) {
      colWidths = [6, 50, 22, 22];
    } else if (isPrice) {
      colWidths = [45, 22, 33, 0]; // ajuste manual
      // Si tiene 4 columnas tipo "Componente | Monto | Pago | ..." — equilibrio
      colWidths = [38, 22, 40];
      // Volver a 4 columnas si realmente hay 4
      if (header.length === 4) colWidths = [38, 22, 20, 20];
    } else {
      colWidths = [28, 24, 24, 24];
    }
  } else {
    const w = Math.floor(100 / header.length);
    colWidths = header.map(() => w);
  }

  return (
    <View
      style={{
        marginVertical: 10,
        borderWidth: 1,
        borderColor: BORDER_GRAY,
        borderRadius: 4,
        overflow: 'hidden',
      }}
      key={keyBase}
      wrap={false}
    >
      <View style={{
        flexDirection: 'row',
        backgroundColor: ACCENT,
        paddingVertical: 7,
        paddingHorizontal: 6,
      }}>
        {header.map((h, i) => (
          <View key={`${keyBase}-h-${i}`} style={{ flex: colWidths[i], paddingHorizontal: 5 }}>
            <Text style={{
              fontSize: 8.5,
              fontFamily: 'Helvetica-Bold',
              color: 'white',
              lineHeight: 1.3,
            }}>
              {h}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={`${keyBase}-r-${ri}`}
          style={{
            flexDirection: 'row',
            paddingVertical: 7,
            paddingHorizontal: 6,
            backgroundColor: ri % 2 === 0 ? 'white' : SOFT_BG,
          }}
          wrap={false}
        >
          {row.map((c, ci) => (
            <View key={`${keyBase}-r-${ri}-c-${ci}`} style={{
              flex: colWidths[ci],
              paddingHorizontal: 5,
            }}>
              <Text style={{
                fontSize: 9,
                color: INK,
                fontFamily: ci === 0 ? 'Helvetica-Bold' : 'Helvetica',
                lineHeight: 1.4,
              }}>
                {renderInline(c, `${keyBase}-r-${ri}-c-${ci}`)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Markdown line renderer con headings propios ──────────────────────────────

interface RenderCtx {
  keyCounter: { n: number };
}

function renderMarkdownLines(md: string, ctx: RenderCtx): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: Array<{ num: string; text: string }> | null = null;
  let bulletItems: string[] | null = null;

  // Buffer de headings pendientes: cuando sale un H2/H3, se encola aquí hasta
  // que llega el siguiente contenido real (no-blank). En ese momento se envuelve
  // heading(s) + primer contenido en un <View wrap={false}> para que no se
  // separen por page break. Esto previene orphans intra-bloque sin requerir
  // minPresenceAhead (que estaba generando errores en react-pdf).
  let pendingHeadings: React.ReactNode[] = [];

  const pushContent = (node: React.ReactNode) => {
    if (pendingHeadings.length > 0) {
      nodes.push(
        <View key={`wrap-h-${ctx.keyCounter.n++}`} wrap={false}>
          {pendingHeadings}
          {node}
        </View>
      );
      pendingHeadings = [];
    } else {
      nodes.push(node);
    }
  };

  const flushNumList = () => {
    if (!listItems) return;
    const listNode = (
      <View key={`nl-${ctx.keyCounter.n++}`} style={{ marginVertical: 6, marginLeft: 2 }}>
        {listItems.map((item, i) => (
          <View key={i} style={{
            flexDirection: 'row',
            marginBottom: 5,
            alignItems: 'flex-start',
          }}>
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: ACCENT,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              marginTop: 1,
            }}>
              <Text style={{ color: 'white', fontSize: 8, fontFamily: 'Helvetica-Bold' }}>
                {item.num}
              </Text>
            </View>
            <Text style={{ flex: 1, fontSize: 10, color: INK, lineHeight: 1.5 }}>
              {renderInline(item.text, `nl-item-${i}`)}
            </Text>
          </View>
        ))}
      </View>
    );
    pushContent(listNode);
    listItems = null;
  };

  const flushBullets = () => {
    if (!bulletItems) return;
    const bulletNode = (
      <View key={`bl-${ctx.keyCounter.n++}`} style={{ marginVertical: 6, marginLeft: 2 }}>
        {bulletItems.map((item, i) => (
          <View key={i} style={{
            flexDirection: 'row',
            marginBottom: 4,
            alignItems: 'flex-start',
          }}>
            <Text style={{ fontSize: 10, color: ACCENT, width: 14, marginTop: 0.5 }}>•</Text>
            <Text style={{ flex: 1, fontSize: 10, color: INK, lineHeight: 1.5 }}>
              {renderInline(item, `bl-item-${i}`)}
            </Text>
          </View>
        ))}
      </View>
    );
    pushContent(bulletNode);
    bulletItems = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      flushNumList();
      flushBullets();
      nodes.push(<View key={`sp-${ctx.keyCounter.n++}`} style={{ height: 5 }} />);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      flushNumList();
      flushBullets();
      nodes.push(
        <View
          key={`hr-${ctx.keyCounter.n++}`}
          style={{
            marginVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: BORDER_GRAY,
          }}
        />
      );
      continue;
    }

    // H1 (document title - should only appear once, use larger style)
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      flushNumList();
      flushBullets();
      nodes.push(
        <Text key={`h1-${ctx.keyCounter.n++}`} style={{
          fontSize: 18,
          fontFamily: 'Helvetica-Bold',
          color: ACCENT,
          marginTop: 4,
          marginBottom: 8,
          lineHeight: 1.25,
        }}>
          {renderInline(h1Match[1], `h1-${ctx.keyCounter.n}`)}
        </Text>
      );
      continue;
    }

    // H2 (sección principal) — se encola en pendingHeadings para wrap={false}
    // con el siguiente contenido real.
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushNumList();
      flushBullets();
      pendingHeadings.push(
        <View key={`h2-${ctx.keyCounter.n++}`}
          style={{
            marginTop: 16,
            marginBottom: 8,
            paddingBottom: 4,
            borderBottomWidth: 1,
            borderBottomColor: LIGHT_BORDER,
          }}
        >
          <Text style={{
            fontSize: 13,
            fontFamily: 'Helvetica-Bold',
            color: INK,
            lineHeight: 1.3,
          }}>
            {renderInline(h2Match[1], `h2-${ctx.keyCounter.n}`)}
          </Text>
        </View>
      );
      continue;
    }

    // H3 (subsección) — igual que H2, se encola.
    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      flushNumList();
      flushBullets();
      pendingHeadings.push(
        <Text key={`h3-${ctx.keyCounter.n++}`} style={{
          fontSize: 10.5,
          fontFamily: 'Helvetica-Bold',
          color: ACCENT,
          marginTop: 12,
          marginBottom: 5,
          lineHeight: 1.3,
        }}>
          {renderInline(h3Match[1], `h3-${ctx.keyCounter.n}`)}
        </Text>
      );
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      flushBullets();
      if (!listItems) listItems = [];
      listItems.push({ num: numMatch[1], text: numMatch[2] });
      continue;
    }

    // Bullet
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushNumList();
      if (!bulletItems) bulletItems = [];
      bulletItems.push(bulletMatch[1]);
      continue;
    }

    // Plain paragraph
    flushNumList();
    flushBullets();
    const paragraph = (
      <Text key={`p-${ctx.keyCounter.n++}`} style={{
        fontSize: 10,
        color: INK,
        marginBottom: 6,
        lineHeight: 1.55,
        textAlign: 'justify',
      }}>
        {renderInline(trimmed, `p-${ctx.keyCounter.n}`)}
      </Text>
    );
    pushContent(paragraph);
  }

  flushNumList();
  flushBullets();

  // Si quedaron headings sin contenido siguiente (bloque termina en heading),
  // vaciarlos al final del array como nodos sueltos. El sistema de headingPrefix
  // ya se encarga de pasarlos al bloque siguiente si aplica.
  if (pendingHeadings.length > 0) {
    nodes.push(...pendingHeadings);
    pendingHeadings = [];
  }
  return nodes;
}

// ─── Parser de bloques (markdown vs tabla) ────────────────────────────────────

type Block =
  | { kind: 'md'; content: string; headingPrefix?: string }
  | { kind: 'table'; lines: string[]; headingPrefix?: string };

function splitBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let mdBuffer: string[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  const flushMd = () => {
    if (mdBuffer.length > 0) {
      blocks.push({ kind: 'md', content: mdBuffer.join('\n') });
      mdBuffer = [];
    }
  };
  const flushTable = () => {
    if (tableBuffer.length > 0) {
      blocks.push({ kind: 'table', lines: tableBuffer });
      tableBuffer = [];
    }
  };

  for (const line of lines) {
    const isTableLine = line.trim().startsWith('|');
    if (isTableLine) {
      if (!inTable) flushMd();
      inTable = true;
      tableBuffer.push(line);
    } else {
      if (inTable) flushTable();
      inTable = false;
      mdBuffer.push(line);
    }
  }
  flushMd();
  flushTable();
  return pullTrailingHeadings(blocks);
}

/**
 * Previene orphan headings. Dos escenarios cubiertos:
 *
 *   Caso 1: un bloque markdown termina con un H2 o H3 solo (seguido únicamente
 *   de líneas en blanco). Pulls el heading al siguiente bloque como prefijo.
 *
 *   Caso 2: un bloque markdown termina con un H2 o H3 seguido de pocas líneas
 *   de contenido (hasta 6 líneas no-blancas), Y el siguiente bloque es una
 *   tabla. En este caso, el heading + el párrafo intro + la tabla deben viajar
 *   juntos. Pulls heading + párrafo intro al siguiente bloque (la tabla) como
 *   prefijo.
 *
 * En render, prefix + contenido se envuelven en un View con wrap={false} para
 * que viajen juntos a la siguiente página si no caben en la actual.
 */
function pullTrailingHeadings(blocks: Block[]): Block[] {
  const result: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'md' || i >= blocks.length - 1) {
      result.push(b);
      continue;
    }

    const nextBlock = blocks[i + 1];
    const nextIsTable = nextBlock.kind === 'table';

    const contentLines = b.content.split('\n');

    // Buscar el ÚLTIMO heading H2/H3 en el bloque (walking back).
    let lastHeadingIdx = -1;
    for (let j = contentLines.length - 1; j >= 0; j--) {
      if (/^#{2,3}\s+/.test(contentLines[j].trim())) {
        lastHeadingIdx = j;
        break;
      }
    }

    if (lastHeadingIdx < 0) {
      result.push(b);
      continue;
    }

    // Contar líneas no-blancas DESPUÉS del heading
    let nonBlankAfter = 0;
    for (let j = lastHeadingIdx + 1; j < contentLines.length; j++) {
      if (contentLines[j].trim() !== '') nonBlankAfter++;
    }

    // Decidir si pullear:
    //   (a) nada sigue al heading dentro de este bloque → orphan clásico, pull
    //   (b) sigue una tabla + el párrafo intro es corto (≤ 6 líneas) → pull para
    //       que heading + intro + tabla queden juntos
    const shouldPull = nonBlankAfter === 0 || (nextIsTable && nonBlankAfter <= 6);

    if (!shouldPull) {
      result.push(b);
      continue;
    }

    const headingSection = contentLines
      .slice(lastHeadingIdx)
      .join('\n')
      .trim();
    const remaining = contentLines
      .slice(0, lastHeadingIdx)
      .join('\n')
      .trimEnd();

    if (remaining.trim()) {
      result.push({ kind: 'md', content: remaining });
    }

    const combinedPrefix = nextBlock.headingPrefix
      ? `${headingSection}\n\n${nextBlock.headingPrefix}`
      : headingSection;
    blocks[i + 1] = { ...nextBlock, headingPrefix: combinedPrefix } as Block;
  }
  return result;
}

// ─── Cover block "Preparado para" ─────────────────────────────────────────────

function renderCoverBlock(brand: BrandKit): React.ReactNode {
  return (
    <View
      key="cover"
      style={{
        marginTop: 20,
        marginBottom: 16,
        padding: 16,
        backgroundColor: LIGHT_BG,
        borderLeftWidth: 3,
        borderLeftColor: ACCENT,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
      }}
      wrap={false}
    >
      <Text style={{
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: ACCENT,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        Propuesta comercial
      </Text>
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
            Preparado para
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 1 }}>
            Francisco J. Chapa V.
          </Text>
          <Text style={{ fontSize: 9, color: INK }}>
            IPark Estacionamientos
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
            Preparado por
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 1 }}>
            Nazre Assad
          </Text>
          <Text style={{ fontSize: 9, color: INK }}>
            Centinelia
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingTop: 10, borderTopWidth: 1, borderTopColor: LIGHT_BORDER }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
            Fecha
          </Text>
          <Text style={{ fontSize: 9, color: INK }}>
            4 de octubre de 2026
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 7.5, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
            Validez
          </Text>
          <Text style={{ fontSize: 9, color: INK }}>
            30 días naturales
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Signature block ──────────────────────────────────────────────────────────

function renderSignatureBlock(): React.ReactNode {
  return (
    <View key="sig" style={{ marginTop: 30, marginBottom: 10 }} wrap={false}>
      <Text style={{
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: ACCENT,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 20,
      }}>
        Aceptación de propuesta
      </Text>
      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        <View style={{ flex: 1, marginRight: 20 }}>
          <View style={{
            borderBottomWidth: 1,
            borderBottomColor: INK,
            marginBottom: 6,
            height: 26,
          }} />
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>
            Francisco J. Chapa V.
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 1 }}>
            IPark Estacionamientos
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 6 }}>
            Fecha: _______________
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 20 }}>
          <View style={{
            borderBottomWidth: 1,
            borderBottomColor: INK,
            marginBottom: 6,
            height: 26,
          }} />
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>
            Nazre Assad
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 1 }}>
            Centinelia
          </Text>
          <Text style={{ fontSize: 8, color: MUTED, marginTop: 6 }}>
            Fecha: _______________
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Documento completo ───────────────────────────────────────────────────────

function ProposalDoc({ brand, content }: { brand: BrandKit; content: string }) {
  const accent = brand.color || '#6C3BFF';
  const blocks = splitBlocks(content);
  const ctx: RenderCtx = { keyCounter: { n: 0 } };

  // Separar el H1 inicial para ponerlo arriba, luego cover, luego el resto
  const firstMdBlock = blocks.find(b => b.kind === 'md') as Extract<Block, { kind: 'md' }> | undefined;
  const h1Match = firstMdBlock?.content.match(/^#\s+(.+)$/m);
  const h2Match = firstMdBlock?.content.match(/^##\s+(.+)$/m);

  // Procesar: título H1 + subtítulo H2 van arriba, luego cover block, luego resto
  // Removemos el H1 y H2 iniciales + metadata del primer bloque para evitar duplicación
  let processedBlocks = [...blocks];
  if (firstMdBlock) {
    const lines = firstMdBlock.content.split('\n');
    // Encontrar donde termina la metadata inicial (primer "---" o primer heading no-metadata)
    let endIdx = 0;
    let skipPreamble = true;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (skipPreamble) {
        // Saltar hasta el primer "---" (separador después de metadata)
        if (l === '---') {
          endIdx = i + 1;
          skipPreamble = false;
          break;
        }
      }
    }
    const trimmed = lines.slice(endIdx).join('\n').trimStart();
    processedBlocks = [{ kind: 'md', content: trimmed }, ...blocks.slice(1)];
  }

  const title = h1Match ? h1Match[1] : 'Propuesta comercial';
  const subtitle = h2Match ? h2Match[1] : '';

  const footerParts = [
    brand.footerText,
    brand.phone,
    brand.website,
  ].filter(Boolean);

  return (
    <Document title={`Propuesta Centinelia · ${title}`} author={brand.businessName}>
      <Page
        size="A4"
        style={{
          paddingTop: 44,
          paddingBottom: 72,
          paddingHorizontal: 48,
          fontFamily: 'Helvetica',
          fontSize: 10,
          color: INK,
          lineHeight: 1.5,
        }}
      >
        {/* Header con logo + accent bar */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 20,
          paddingBottom: 12,
          borderBottomWidth: 2,
          borderBottomColor: accent,
        }}>
          <View>
            {brand.logoUrl
              ? <Image src={brand.logoUrl} style={{ height: 40, maxWidth: 160, objectFit: 'contain' } as any} />
              : <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold' }}>{brand.businessName}</Text>
            }
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: accent }}>
              Propuesta comercial
            </Text>
            <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
              4 de octubre de 2026
            </Text>
          </View>
        </View>

        {/* Título principal */}
        <Text style={{
          fontSize: 18,
          fontFamily: 'Helvetica-Bold',
          color: accent,
          lineHeight: 1.25,
          marginBottom: 4,
        }}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{
            fontSize: 12,
            color: INK,
            marginBottom: 4,
          }}>
            {subtitle}
          </Text>
        )}

        {/* Cover block */}
        {renderCoverBlock(brand)}

        {/* Contenido aplanado para que H2/H3 (con minPresenceAhead) puedan "ver"
            las tablas y párrafos siguientes como siblings directos. Sin envolver
            cada bloque md en su propio View, los nodos de cada bloque quedan al
            mismo nivel que las tablas y la lógica de anti-orfandad funciona
            cross-block de forma natural. */}
        {processedBlocks.flatMap((block, i) => {
          if (block.kind === 'table') {
            // headingPrefix: cuando el block previo terminó con un heading y lo
            // movimos como prefijo. Rendereamos prefix + tabla envueltos en un
            // wrap={false} para que no se separen.
            if (block.headingPrefix) {
              return [
                <View key={`wrap-${i}`} wrap={false}>
                  {renderMarkdownLines(block.headingPrefix, ctx)}
                  {renderMarkdownTable(block.lines, `table-${i}`)}
                </View>,
              ];
            }
            return [renderMarkdownTable(block.lines, `table-${i}`)];
          }
          // Bloque md: devolver nodos individuales (array), no envolverlos en View.
          const nodes = renderMarkdownLines(block.content, ctx);
          if (block.headingPrefix) {
            // Si por alguna razón el bloque md tiene headingPrefix, lo rendereamos
            // envuelto con wrap={false} con sus primeros nodos.
            return [
              <View key={`wrap-${i}`} wrap={false}>
                {renderMarkdownLines(block.headingPrefix, ctx)}
                {nodes}
              </View>,
            ];
          }
          return nodes;
        })}

        {/* Signature block */}
        {renderSignatureBlock()}

        {/* Footer fixed en todas las páginas */}
        <View fixed style={{
          position: 'absolute',
          bottom: 28,
          left: 48,
          right: 48,
          borderTopWidth: 1,
          borderTopColor: BORDER_GRAY,
          paddingTop: 8,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}>
          <Text style={{ fontSize: 7.5, color: MUTED }}>
            {footerParts.join('  ·  ')}
          </Text>
          <Text
            style={{ fontSize: 7.5, color: MUTED }}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

async function main(): Promise<void> {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input no existe: ${INPUT_PATH}`);
  }

  const md = fs.readFileSync(INPUT_PATH, 'utf-8');
  console.log(`[gen-pdf] Leído markdown (${md.length} chars)`);

  const doc = <ProposalDoc brand={BRAND} content={md} />;

  console.log('[gen-pdf] Renderizando PDF...');
  const stream = await renderToStream(doc);

  const writeStream = fs.createWriteStream(OUTPUT_PATH);
  await new Promise<void>((resolve, reject) => {
    stream.pipe(writeStream);
    writeStream.on('finish', () => resolve());
    writeStream.on('error', reject);
    stream.on('error', reject);
  });

  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`[gen-pdf] OK Escrito ${OUTPUT_PATH} (${(stats.size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('[gen-pdf] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
