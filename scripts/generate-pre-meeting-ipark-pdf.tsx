/**
 * Genera PDF con branding Centinelia del documento de arranque de la reunión
 * del lunes 2026-10-05 con Americo (IPark) + equipo dev.
 *
 * Uso:
 *   npx tsx scripts/generate-pre-meeting-ipark-pdf.tsx
 *
 * Output:
 *   demos/ipark/12-pre-meeting-lunes.pdf
 *
 * Esta versión reemplaza los diagramas ASCII por diagramas visuales reales
 * (cajas numeradas en morado Centinelia con conectores), y corrige el
 * rendering de las tablas comparativas (columnas equilibradas, fuente más
 * compacta, celdas con wrapping correcto).
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStream, View, Text } from '@react-pdf/renderer';
import { BrandedDoc, S } from '@/lib/pdf/doc';
import { renderMarkdown } from '@/lib/pdf/markdown';
import type { BrandKit } from '@/lib/brand/kit';

const INPUT_PATH  = path.resolve('demos/ipark/12-pre-meeting-lunes.md');
const OUTPUT_PATH = path.resolve('demos/ipark/12-pre-meeting-lunes.pdf');

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
  address:        null,
  footerText:     'Pre-reunión · uso interno · no distribuir',
};

const ACCENT = '#6C3BFF';
const INK = '#1A0A3B';
const MUTED = '#6b7280';
const LIGHT_BG = '#F7F5FF';
const LIGHT_BORDER = '#E0D5FF';
const SOFT_BG = '#F9FAFB';

// ─── Tabla comparativa ────────────────────────────────────────────────────────

function renderMarkdownTable(lines: string[], keyBase: string): React.ReactNode {
  if (lines.length < 2) return null;
  const header = lines[0].split('|').map(c => c.trim()).filter(c => c.length > 0);
  const dataLines = lines.slice(2).filter(l => l.trim().length > 0);
  const rows = dataLines.map(l =>
    l.split('|').map(c => c.trim()).filter((_, i) => i < header.length + 1).slice(1)
  );

  // Detectar formato action-items (# | Qué | Quién | Cuándo) vs tabla comparativa normal.
  // Action-items: columna 1 es un número, usamos widths asimétricos.
  // Comparativa: distribución equilibrada con primera columna un poco mayor.
  const isActionItems = header.length === 4 && header[0].trim() === '#';
  const isComparison = header.length >= 3 && !isActionItems;

  let colWidths: number[];
  if (isActionItems) {
    colWidths = [6, 50, 22, 22];
  } else if (isComparison && header.length === 4) {
    // Primera columna (dimensión) un poco mayor, resto equilibrado
    colWidths = [28, 24, 24, 24];
  } else {
    colWidths = header.map(() => Math.floor(100 / header.length));
  }

  const cellFontSize = isComparison ? 7.5 : 9;
  const headerFontSize = isComparison ? 7.5 : 9;
  const cellPadding = isComparison ? 5 : 6;

  return (
    <View
      style={{ marginBottom: 14, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4 }}
      key={keyBase}
      wrap={false}
    >
      <View style={{
        flexDirection: 'row',
        backgroundColor: ACCENT,
        paddingVertical: cellPadding + 1,
        paddingHorizontal: 6,
      }}>
        {header.map((h, i) => (
          <View key={`${keyBase}-h-${i}`} style={{ flex: colWidths[i], paddingHorizontal: 4 }}>
            <Text style={{
              fontSize: headerFontSize,
              fontFamily: 'Helvetica-Bold',
              color: 'white',
              lineHeight: 1.25,
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
            paddingVertical: cellPadding,
            paddingHorizontal: 6,
            backgroundColor: ri % 2 === 0 ? 'white' : SOFT_BG,
            borderTopWidth: ri > 0 ? 0 : 0,
          }}
          wrap={false}
        >
          {row.map((c, ci) => (
            <View key={`${keyBase}-r-${ri}-c-${ci}`} style={{
              flex: colWidths[ci],
              paddingHorizontal: 4,
            }}>
              <Text style={{
                fontSize: cellFontSize,
                color: ci === 0 ? INK : INK,
                fontFamily: ci === 0 ? 'Helvetica-Bold' : 'Helvetica',
                lineHeight: 1.35,
              }}>
                {c}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Diagrama de flujo visual ─────────────────────────────────────────────────

interface FlowStep {
  n: number;
  actor: string;      // Quién ejecuta (Nala, IPark endpoint, etc.)
  title: string;      // Título de la acción
  description: string; // Bullets separados por " · "
  side_note?: string; // Nota lateral opcional (ej. loop annotation)
}

interface ParsedFlow {
  heading: string;
  description?: string;
  steps: Array<{ step?: FlowStep; connector?: string }>;
}

/**
 * Parsea un bloque flow:X con formato:
 *   heading = <título del diagrama>
 *   description = <párrafo explicativo opcional>
 *   1 | <actor> | <title> | <description> [| side=<nota>]
 *   -> <conector>
 *   2 | ...
 */
function parseFlow(content: string, heading: string): ParsedFlow {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const steps: Array<{ step?: FlowStep; connector?: string }> = [];
  let description: string | undefined;

  for (const line of lines) {
    const descMatch = line.match(/^description\s*=\s*(.+)$/);
    if (descMatch) {
      description = descMatch[1].trim();
      continue;
    }
    if (line.startsWith('->') || line.startsWith('→')) {
      const label = line.replace(/^(->|→)\s*/, '').trim();
      steps.push({ connector: label });
      continue;
    }
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 4) {
      const n = parseInt(parts[0], 10);
      if (isNaN(n)) continue;
      const sideMatch = parts[3].match(/^(.*?)\s*side=(.+)$/);
      const stepDescription = sideMatch ? sideMatch[1].trim() : parts[3];
      const side_note = sideMatch ? sideMatch[2].trim() : undefined;
      steps.push({
        step: {
          n,
          actor: parts[1],
          title: parts[2],
          description: stepDescription,
          side_note,
        },
      });
    }
  }

  return { heading, description, steps };
}

function renderFlowStep(step: FlowStep, keyBase: string): React.ReactNode {
  const bullets = step.description.split(/\s*·\s*/).filter(b => b.length > 0);

  return (
    <View key={keyBase} style={{ flexDirection: 'row', marginBottom: 0 }} wrap={false}>
      {/* Numbered badge column */}
      <View style={{ width: 36, alignItems: 'center' }}>
        <View style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: ACCENT,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{
            color: 'white',
            fontSize: 12,
            fontFamily: 'Helvetica-Bold',
          }}>
            {step.n}
          </Text>
        </View>
      </View>

      {/* Content column */}
      <View style={{ flex: 1, paddingLeft: 10, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{
            fontSize: 10,
            fontFamily: 'Helvetica-Bold',
            color: INK,
            marginRight: 6,
          }}>
            {step.title}
          </Text>
          <Text style={{
            fontSize: 8,
            fontFamily: 'Helvetica-Oblique',
            color: ACCENT,
          }}>
            {step.actor}
          </Text>
        </View>
        <View style={{ marginTop: 3 }}>
          {bullets.map((b, i) => (
            <View key={`${keyBase}-b-${i}`} style={{
              flexDirection: 'row',
              marginBottom: 1,
            }}>
              <Text style={{ fontSize: 8, color: ACCENT, width: 8 }}>•</Text>
              <Text style={{
                fontSize: 8.5,
                color: INK,
                flex: 1,
                lineHeight: 1.35,
              }}>
                {b}
              </Text>
            </View>
          ))}
        </View>
        {step.side_note && (
          <View style={{
            marginTop: 4,
            paddingVertical: 3,
            paddingHorizontal: 6,
            backgroundColor: LIGHT_BG,
            borderLeftWidth: 2,
            borderLeftColor: ACCENT,
          }}>
            <Text style={{
              fontSize: 7.5,
              fontFamily: 'Helvetica-Oblique',
              color: INK,
            }}>
              ↺ {step.side_note}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function renderFlowConnector(label: string, keyBase: string): React.ReactNode {
  return (
    <View key={keyBase} style={{ flexDirection: 'row' }} wrap={false}>
      <View style={{ width: 36, alignItems: 'center' }}>
        <View style={{ width: 2, height: 18, backgroundColor: ACCENT }} />
        <View style={{
          width: 0,
          height: 0,
          borderLeftWidth: 4,
          borderRightWidth: 4,
          borderTopWidth: 5,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: ACCENT,
          marginTop: -1,
        }} />
      </View>
      <View style={{ flex: 1, paddingLeft: 10, justifyContent: 'center' }}>
        {label && (
          <Text style={{
            fontSize: 7.5,
            fontFamily: 'Helvetica-Oblique',
            color: MUTED,
          }}>
            {label}
          </Text>
        )}
      </View>
    </View>
  );
}

function renderFlowDiagram(flow: ParsedFlow, keyBase: string): React.ReactNode {
  return (
    <View
      key={keyBase}
      style={{
        marginVertical: 14,
        padding: 14,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: LIGHT_BORDER,
        borderRadius: 6,
      }}
      wrap={false}
    >
      <Text style={{
        fontSize: 12,
        fontFamily: 'Helvetica-Bold',
        color: ACCENT,
        marginBottom: flow.description ? 6 : 10,
      }}>
        {flow.heading}
      </Text>
      {flow.description && (
        <Text style={{
          fontSize: 9,
          color: MUTED,
          marginBottom: 12,
          lineHeight: 1.45,
          fontFamily: 'Helvetica-Oblique',
        }}>
          {flow.description}
        </Text>
      )}
      {flow.steps.map((item, i) => {
        if (item.step) return renderFlowStep(item.step, `${keyBase}-s-${i}`);
        if (item.connector !== undefined) return renderFlowConnector(item.connector, `${keyBase}-c-${i}`);
        return null;
      })}
    </View>
  );
}

// ─── Action items template visual (reemplaza code-block monospace) ────────────

/**
 * Renderiza una card visual tipo "formulario de minuta" en lugar del code-block
 * markdown. Parsea sub-secciones (Decisiones, Action items table, Preguntas,
 * Siguiente contacto) y las muestra con mejor jerarquía visual.
 */
function renderActionItemsTemplate(content: string, keyBase: string): React.ReactNode {
  const lines = content.split('\n');
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      // El H1 inicial lo descartamos (ya está en el heading del card)
      continue;
    }
    if (h2) {
      if (current) sections.push(current);
      current = { title: h2[1].trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);

  return (
    <View
      key={keyBase}
      style={{
        marginVertical: 14,
        padding: 16,
        backgroundColor: LIGHT_BG,
        borderWidth: 1,
        borderColor: LIGHT_BORDER,
        borderRadius: 6,
      }}
    >
      <View style={{
        borderBottomWidth: 2,
        borderBottomColor: ACCENT,
        paddingBottom: 8,
        marginBottom: 12,
      }}>
        <Text style={{
          fontSize: 7,
          fontFamily: 'Helvetica-Bold',
          color: ACCENT,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 2,
        }}>
          Plantilla de minuta
        </Text>
        <Text style={{
          fontSize: 13,
          fontFamily: 'Helvetica-Bold',
          color: INK,
        }}>
          Reunión Centinelia + IPark · 2026-10-05, 10:00 AM MX
        </Text>
      </View>

      {sections.map((sec, si) => (
        <View key={`${keyBase}-sec-${si}`} style={{ marginBottom: 14 }} wrap={false}>
          <Text style={{
            fontSize: 10,
            fontFamily: 'Helvetica-Bold',
            color: ACCENT,
            marginBottom: 6,
          }}>
            {sec.title}
          </Text>
          {renderMinuteSectionBody(sec.body, `${keyBase}-sec-${si}-body`)}
        </View>
      ))}
    </View>
  );
}

function renderMinuteSectionBody(bodyLines: string[], keyBase: string): React.ReactNode {
  // Detectar si contiene una tabla (líneas que empiezan con |)
  const tableLines = bodyLines.filter(l => l.trim().startsWith('|'));
  if (tableLines.length >= 2) {
    return renderMarkdownTable(tableLines, `${keyBase}-table`);
  }

  // Si no hay tabla, procesar línea por línea
  const items: React.ReactNode[] = [];
  bodyLines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Lista numerada "1. texto"
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      items.push(
        <View key={`${keyBase}-i-${i}`} style={{
          flexDirection: 'row',
          marginBottom: 5,
          paddingLeft: 2,
        }}>
          <View style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: ACCENT,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            marginTop: 1,
          }}>
            <Text style={{
              color: 'white',
              fontSize: 8,
              fontFamily: 'Helvetica-Bold',
            }}>
              {numMatch[1]}
            </Text>
          </View>
          <Text style={{ flex: 1, fontSize: 9, color: INK, lineHeight: 1.4 }}>
            {parseInlineBrackets(numMatch[2])}
          </Text>
        </View>
      );
      return;
    }

    // Bullet "- texto"
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      items.push(
        <View key={`${keyBase}-i-${i}`} style={{
          flexDirection: 'row',
          marginBottom: 4,
          paddingLeft: 6,
        }}>
          <Text style={{ fontSize: 9, color: ACCENT, width: 10 }}>•</Text>
          <Text style={{ flex: 1, fontSize: 9, color: INK, lineHeight: 1.4 }}>
            {parseInlineBrackets(bulletMatch[1])}
          </Text>
        </View>
      );
      return;
    }

    // Línea plana con posible "Clave: valor" o solo texto
    items.push(
      <Text key={`${keyBase}-i-${i}`} style={{
        fontSize: 9,
        color: INK,
        marginBottom: 4,
        lineHeight: 1.4,
      }}>
        {parseInlineBrackets(trimmed)}
      </Text>
    );
  });

  return <View>{items}</View>;
}

/**
 * Renderiza [placeholder] como un chip gris claro para indicar "a llenar".
 */
function parseInlineBrackets(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <Text
        key={`chip-${key++}`}
        style={{
          backgroundColor: '#E5E7EB',
          color: '#6b7280',
          fontSize: 8,
          paddingHorizontal: 3,
        }}
      >
        {' '}{match[1]}{' '}
      </Text>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

// ─── Code block simple (para plantilla action items) ─────────────────────────

function renderCodeBlock(content: string, keyBase: string): React.ReactNode {
  return (
    <View
      key={keyBase}
      style={{
        marginVertical: 10,
        padding: 10,
        backgroundColor: LIGHT_BG,
        borderWidth: 1,
        borderColor: LIGHT_BORDER,
        borderRadius: 4,
      }}
    >
      <Text style={{ fontFamily: 'Courier', fontSize: 8, color: INK, lineHeight: 1.4 }}>
        {content}
      </Text>
    </View>
  );
}

// ─── Parser de bloques markdown ───────────────────────────────────────────────

type Block =
  | { kind: 'md'; content: string }
  | { kind: 'table'; lines: string[] }
  | { kind: 'code'; content: string; lang: string | null };

function splitMarkdownBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let mdBuffer: string[] = [];
  let tableBuffer: string[] = [];
  let codeBuffer: string[] = [];
  let codeLang: string | null = null;
  let inTable = false;
  let inCode = false;

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
  const flushCode = () => {
    if (codeBuffer.length > 0) {
      blocks.push({ kind: 'code', content: codeBuffer.join('\n'), lang: codeLang });
      codeBuffer = [];
      codeLang = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushMd();
        flushTable();
        inTable = false;
        inCode = true;
        codeLang = trimmed.slice(3).trim() || null;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const isTableLine = trimmed.startsWith('|');
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
  flushCode();

  return blocks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input no existe: ${INPUT_PATH}`);
  }

  const md = fs.readFileSync(INPUT_PATH, 'utf-8');
  console.log(`[gen-pdf] Leído markdown (${md.length} chars)`);

  const blocks = splitMarkdownBlocks(md);
  const flowCount = blocks.filter(b => b.kind === 'code' && b.lang?.startsWith('flow:')).length;
  console.log(`[gen-pdf] Blocks: ${blocks.length} (md: ${blocks.filter(b => b.kind === 'md').length}, tables: ${blocks.filter(b => b.kind === 'table').length}, code: ${blocks.filter(b => b.kind === 'code').length}, flows: ${flowCount})`);

  const doc = (
    <BrandedDoc
      brand={BRAND}
      docType="Pre-reunión IPark"
      subtitle="Lunes 5 de octubre de 2026 · 10:00 AM"
    >
      {blocks.map((block, i) => {
        if (block.kind === 'table') {
          return renderMarkdownTable(block.lines, `table-${i}`);
        }
        if (block.kind === 'code') {
          if (block.lang && block.lang.startsWith('flow:')) {
            // Primer line puede ser "heading=X" para título del diagrama
            const headingMatch = block.content.match(/^heading\s*=\s*(.+)$/m);
            const heading = headingMatch ? headingMatch[1].trim() : block.lang.slice(5).toUpperCase();
            const flowContent = block.content.replace(/^heading\s*=.*$/m, '').trim();
            const flow = parseFlow(flowContent, heading);
            return renderFlowDiagram(flow, `flow-${i}`);
          }
          if (block.lang === 'minuta') {
            return renderActionItemsTemplate(block.content, `minuta-${i}`);
          }
          return renderCodeBlock(block.content, `code-${i}`);
        }
        return (
          <View key={`md-${i}`} style={{ marginBottom: 0 }}>
            {renderMarkdown(block.content)}
          </View>
        );
      })}
    </BrandedDoc>
  );

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
