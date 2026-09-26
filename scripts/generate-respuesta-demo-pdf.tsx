/**
 * Genera PDF con branding Centinelia del documento de respuesta al informe
 * de observaciones del demo de Nia en Santiago NL.
 *
 * Uso:
 *   npx tsx scripts/generate-respuesta-demo-pdf.tsx
 *
 * Output:
 *   docs/plantillas/santiago-nl/04-respuesta-observaciones-demo.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStream, View, Text } from '@react-pdf/renderer';
import { BrandedDoc, S } from '@/lib/pdf/doc';
import { renderMarkdown } from '@/lib/pdf/markdown';
import type { BrandKit } from '@/lib/brand/kit';

const INPUT_PATH  = path.resolve('docs/plantillas/santiago-nl/04-respuesta-observaciones-demo.md');
const OUTPUT_PATH = path.resolve('docs/plantillas/santiago-nl/04-respuesta-observaciones-demo.pdf');

const BRAND: BrandKit = {
  businessName:   'Centinelia',
  logoUrl:        null,
  color:          '#6C3BFF',
  colorSecondary: '#1A0A3B',
  phone:          null,
  website:        'centinelia.mx',
  address:        null,
  footerText:     'Empleados digitales para PyMEs · centinelia.mx',
};

/**
 * Renderiza una tabla markdown (formato pipe) como componente react-pdf.
 * Detecta líneas que empiezan con `|` y las agrupa. La primera fila es header,
 * la separadora `| --- | --- |` se omite, el resto son data rows.
 */
function renderMarkdownTable(lines: string[], keyBase: string): React.ReactNode {
  if (lines.length < 2) return null;
  const header = lines[0].split('|').map(c => c.trim()).filter(c => c.length > 0);
  const dataLines = lines.slice(2).filter(l => l.trim().length > 0);
  const rows = dataLines.map(l => l.split('|').map(c => c.trim()).filter((_, i) => i < header.length + 1).slice(1));

  const colWidths = header.map((_, i) => {
    if (header.length === 4 && i === 0) return 6;
    if (header.length === 4 && i === 1) return 50;
    if (header.length === 4) return 22;
    return Math.floor(100 / header.length);
  });

  return (
    <View style={{ marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4 }} key={keyBase}>
      <View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 6, paddingHorizontal: 8 }}>
        {header.map((h, i) => (
          <Text key={`${keyBase}-h-${i}`} style={{ flex: colWidths[i], fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1A0A3B' }}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={`${keyBase}-r-${ri}`}
          style={{
            flexDirection: 'row',
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderTopWidth: ri > 0 ? 1 : 0,
            borderTopColor: '#f3f4f6',
          }}
        >
          {row.map((c, ci) => (
            <Text key={`${keyBase}-r-${ri}-c-${ci}`} style={{ flex: colWidths[ci], fontSize: 9, color: '#1A0A3B' }}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Preprocessa markdown para extraer las tablas y renderizarlas por separado.
 * Devuelve array de bloques: cada bloque es un chunk de markdown texto o una tabla ya renderizada.
 */
function splitMarkdownWithTables(md: string): Array<{ kind: 'md'; content: string } | { kind: 'table'; lines: string[] }> {
  const lines = md.split(/\r?\n/);
  const blocks: Array<{ kind: 'md'; content: string } | { kind: 'table'; lines: string[] }> = [];
  let mdBuffer: string[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const isTableLine = line.trim().startsWith('|');
    if (isTableLine) {
      if (!inTable && mdBuffer.length > 0) {
        blocks.push({ kind: 'md', content: mdBuffer.join('\n') });
        mdBuffer = [];
      }
      inTable = true;
      tableBuffer.push(line);
    } else {
      if (inTable && tableBuffer.length > 0) {
        blocks.push({ kind: 'table', lines: tableBuffer });
        tableBuffer = [];
      }
      inTable = false;
      mdBuffer.push(line);
    }
  }
  if (inTable && tableBuffer.length > 0) blocks.push({ kind: 'table', lines: tableBuffer });
  if (mdBuffer.length > 0) blocks.push({ kind: 'md', content: mdBuffer.join('\n') });

  return blocks;
}

async function main(): Promise<void> {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input no existe: ${INPUT_PATH}`);
  }

  const md = fs.readFileSync(INPUT_PATH, 'utf-8');
  console.log(`[gen-pdf] Leído markdown (${md.length} chars)`);

  const blocks = splitMarkdownWithTables(md);
  console.log(`[gen-pdf] Blocks: ${blocks.length} (${blocks.filter(b => b.kind === 'table').length} tablas)`);

  const doc = (
    <BrandedDoc
      brand={BRAND}
      docType="Respuesta al Informe de Observaciones"
      subtitle="Municipio de Santiago Nuevo León · 26 de septiembre de 2026"
    >
      {blocks.map((block, i) => {
        if (block.kind === 'table') {
          return renderMarkdownTable(block.lines, `table-${i}`);
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
  console.log(`[gen-pdf] ✅ Escrito ${OUTPUT_PATH} (${(stats.size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('[gen-pdf] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
