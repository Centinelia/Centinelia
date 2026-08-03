/**
 * Minimal Markdown → react-pdf renderer.
 *
 * Los meerkats escriben en Markdown por default (headings con #, bullets con
 * -, negritas con **). Los renderizadores de PDF anteriores solo manejaban
 * `# ` y `## ` a inicio de línea; el resto salía literal (`**palabra**`,
 * `- ítem`).
 *
 * Este helper procesa un string y devuelve un array de <Text>/<View> ya
 * estilizados. Soporta:
 *   - h1: `# título`
 *   - h2: `## subtítulo`
 *   - bullet: `- item` o `* item`
 *   - numbered: `1. item`
 *   - inline bold: `**texto**`
 *   - inline italic: `*texto*` o `_texto_`
 *   - blockquote: `> texto` (una línea)
 *   - horizontal rule: `---` (ignorada, no aporta al PDF)
 *
 * NO soporta: tablas, links, imágenes, code fences, listas anidadas.
 * Si el content viene sin markdown, se renderiza igual (párrafos plain).
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { S } from './doc';

// Regex para tokenizar inline: **bold**, *italic*, _italic_.
// Capturamos con delimitadores para separar del texto.
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  if (!INLINE_RE.test(text)) {
    INLINE_RE.lastIndex = 0;
    return [text];
  }
  INLINE_RE.lastIndex = 0;
  const parts = text.split(INLINE_RE);
  return parts.map((part, i) => {
    if (!part) return null;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      const inner = part.slice(2, -2);
      return <Text key={`${keyBase}-b-${i}`} style={{ fontFamily: 'Helvetica-Bold' }}>{inner}</Text>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      const inner = part.slice(1, -1);
      return <Text key={`${keyBase}-i-${i}`} style={{ fontFamily: 'Helvetica-Oblique' }}>{inner}</Text>;
    }
    return <Text key={`${keyBase}-t-${i}`}>{part}</Text>;
  }).filter(Boolean);
}

export interface MdOptions {
  h1Color?:     string;
  h2Color?:     string;
  bodyColor?:   string;
  bulletColor?: string;
}

export function renderMarkdown(md: string, opts?: MdOptions): React.ReactNode[] {
  const h1Color     = opts?.h1Color     ?? '#6C3BFF';
  const h2Color     = opts?.h2Color     ?? '#1A0A3B';
  const bodyColor   = opts?.bodyColor   ?? '#1A0A3B';
  const bulletColor = opts?.bulletColor ?? '#6b7280';

  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { out.push(<View key={`sp-${key++}`} style={{ height: 6 }} />); continue; }

    // Horizontal rule
    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) continue;

    // Headings
    if (line.startsWith('## ')) {
      out.push(
        <Text key={`h2-${key++}`} style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: h2Color, marginTop: 10, marginBottom: 5 }}>
          {renderInline(line.slice(3), `h2-${key}`)}
        </Text>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      out.push(
        <Text key={`h1-${key++}`} style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: h1Color, marginTop: 14, marginBottom: 6 }}>
          {renderInline(line.slice(2), `h1-${key}`)}
        </Text>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      out.push(
        <View key={`bq-${key++}`} style={{ flexDirection: 'row', marginLeft: 4, marginBottom: 5 }}>
          <View style={{ width: 2, backgroundColor: bulletColor, marginRight: 8 }} />
          <Text style={{ fontFamily: 'Helvetica-Oblique', color: bodyColor, flex: 1 }}>
            {renderInline(line.slice(2), `bq-${key}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Bullet
    const bulletMatch = /^[-*+]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      out.push(
        <View key={`ul-${key++}`} style={{ flexDirection: 'row', marginBottom: 4, marginLeft: 4 }}>
          <Text style={{ width: 12, color: bulletColor }}>•</Text>
          <Text style={{ flex: 1, color: bodyColor }}>
            {renderInline(bulletMatch[1], `ul-${key}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Numbered list
    const numMatch = /^(\d+)\.\s+(.+)$/.exec(line);
    if (numMatch) {
      out.push(
        <View key={`ol-${key++}`} style={{ flexDirection: 'row', marginBottom: 4, marginLeft: 4 }}>
          <Text style={{ width: 20, color: bulletColor }}>{numMatch[1]}.</Text>
          <Text style={{ flex: 1, color: bodyColor }}>
            {renderInline(numMatch[2], `ol-${key}`)}
          </Text>
        </View>
      );
      continue;
    }

    // Plain paragraph
    out.push(
      <Text key={`p-${key++}`} style={{ marginBottom: 5, color: bodyColor }}>
        {renderInline(line, `p-${key}`)}
      </Text>
    );
  }

  return out;
}
