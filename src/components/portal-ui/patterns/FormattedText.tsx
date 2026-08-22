import React from 'react';

/**
 * Renderiza texto largo con formato auto-detectado:
 *
 *   - Párrafos separados por líneas en blanco → gap vertical
 *   - Listas numeradas inline ("1) X 2) Y 3) Z") o multi-línea → `<ol>`
 *   - Listas con bullets ("- foo" / "• bar") → `<ul>`
 *   - `**bold**` → `<strong>`
 *   - URLs http(s) → links violeta
 *
 * Objetivo: descripciones generadas por meerkats o pegadas por el usuario
 * dejan de verse como muros de texto sin estructura. No es un markdown
 * completo — solo lo suficiente para leer sin esfuerzo.
 */
export interface FormattedTextProps {
  text:      string;
  className?: string;
  /** Color base del texto (default heredado del padre). */
  color?:    string;
}

export default function FormattedText({ text, className, color }: FormattedTextProps) {
  if (!text?.trim()) return null;
  const style = color ? { color } : undefined;
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  return (
    <div className={className ?? 'flex flex-col gap-3 text-sm leading-relaxed'} style={style}>
      {paragraphs.map((para, i) => <FormattedParagraph key={i} text={para} />)}
    </div>
  );
}

function FormattedParagraph({ text }: { text: string }) {
  // 1. Lista numerada MULTI-LÍNEA: "1) foo\n2) bar\n3) baz" o "1. foo\n2. bar"
  const multiLine = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const isMultiLineList = multiLine.length >= 2 && multiLine.every(l => /^\d+[\.)]\s/.test(l));
  if (isMultiLineList) {
    return (
      <ol className="list-decimal pl-5 space-y-1">
        {multiLine.map((l, i) => (
          <li key={i}>{renderInline(l.replace(/^\d+[\.)]\s+/, ''))}</li>
        ))}
      </ol>
    );
  }

  // 2. Lista con bullets multi-línea: "- foo\n- bar" o "• foo\n• bar" o "* foo"
  const isBulletList = multiLine.length >= 2 && multiLine.every(l => /^[-•*]\s/.test(l));
  if (isBulletList) {
    return (
      <ul className="list-disc pl-5 space-y-1">
        {multiLine.map((l, i) => (
          <li key={i}>{renderInline(l.replace(/^[-•*]\s+/, ''))}</li>
        ))}
      </ul>
    );
  }

  // 3. Lista numerada INLINE: "prefix: 1) X, 2) Y, 3) Z. tail"
  //    Detecta al menos 2 marcadores tipo "N)" precedidos por espacio o coma.
  const numberedInline = [...text.matchAll(/(?:^|[\s,;:(])(\d+)\)\s+/g)];
  if (numberedInline.length >= 2) {
    const firstIdx = numberedInline[0].index ?? 0;
    // Buscamos el offset real del "N)" (saltando el separador previo).
    const firstMarkerOffset = text.slice(firstIdx).search(/\d+\)\s+/);
    const markerStart = firstIdx + firstMarkerOffset;
    const intro = text.slice(0, markerStart).trim().replace(/[,;:\s]+$/, '');

    // Split del resto en items usando el mismo patrón como separador.
    const rest = text.slice(markerStart);
    const rawItems = rest.split(/(?:^|[\s,;])(?=\d+\)\s+)/).map(s => s.trim()).filter(Boolean);
    const items = rawItems.map(s => s.replace(/^\d+\)\s+/, '').replace(/[.,;]+$/, ''));

    return (
      <div className="flex flex-col gap-2">
        {intro && <p className="whitespace-pre-wrap">{renderInline(intro.endsWith(':') ? intro : intro + ':')}</p>}
        <ol className="list-decimal pl-5 space-y-1">
          {items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ol>
      </div>
    );
  }

  // 4. Párrafo simple: respeta line breaks internos + inline formatting.
  return <p className="whitespace-pre-wrap">{renderInline(text)}</p>;
}

function renderInline(text: string): React.ReactNode {
  // Combina bold `**x**` y URLs http(s) en un solo pass.
  const regex = /(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<>"]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key  = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) {
      parts.push(<strong key={key++} className="font-semibold">{m[1].slice(2, -2)}</strong>);
    } else if (m[2]) {
      parts.push(
        <a key={key++}
          href={m[2]}
          target="_blank"
          rel="noreferrer"
          className="underline break-all"
          style={{ color: '#6C3BFF' }}
        >
          {m[2]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
