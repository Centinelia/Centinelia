// src/lib/human-handoff/parse-reply.ts

/**
 * Separa el texto nuevo de la respuesta del historial citado (quoted history).
 * Cubre Gmail (ES/EN), Outlook (ES/EN), Apple Mail, y firmas comunes.
 *
 * Fallback seguro: si el resultado queda vacío después de todos los strips,
 * devuelve el texto original completo. Es preferible mostrar el hilo entero
 * que perder la respuesta.
 */
export function parseReplyBody(text: string): {
  cleanText: string;
  hadQuotedContent: boolean;
} {
  if (!text || typeof text !== 'string') return { cleanText: '', hadQuotedContent: false };

  const original = text;
  let working = text;
  let hadQuotedContent = false;

  // 1. Corte en separadores conocidos (primer match gana)
  const separators: RegExp[] = [
    /^El .+?, .+? escribió:\s*$/im,           // Gmail español
    /^On .+?, .+? wrote:\s*$/im,              // Gmail inglés
    /^-----+\s*Original Message\s*-----+\s*$/im, // Outlook clásico
    /^_{5,}\s*$/m,                             // Outlook variante (línea de underscores)
    /^From: .+\r?\nSent: /im,                  // Outlook inline
    /^De: .+\r?\nEnviado: /im,                 // Outlook inline español
  ];

  for (const rx of separators) {
    const match = working.match(rx);
    if (match && match.index !== undefined) {
      working = working.slice(0, match.index);
      hadQuotedContent = true;
      break;
    }
  }

  // 2. Trim líneas prefijadas con '>' (si el separador falló pero hay quoting)
  const lines = working.split(/\r?\n/);
  const trimmed: string[] = [];
  let inQuoteBlockAtEnd = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!inQuoteBlockAtEnd && /^>/.test(line.trim())) {
      hadQuotedContent = true;
      continue; // skip trailing quoted lines
    }
    if (line.trim() !== '') inQuoteBlockAtEnd = true;
    trimmed.unshift(line);
  }
  working = trimmed.join('\n');

  // 3. Trim firma estándar Unix (-- seguido de todo lo que venga)
  working = working.replace(/^--\s*\r?\n[\s\S]*$/m, '');

  // 4. Trim firma móvil común
  working = working.replace(/^(Enviado desde mi|Sent from my) .+$/im, '');

  // 5. Colapsar 3+ line breaks consecutivos a 2
  working = working.replace(/\n{3,}/g, '\n\n');

  // 6. Trim final
  const cleanText = working.trim();

  // Fallback seguro
  if (cleanText === '') {
    return { cleanText: original.trim(), hadQuotedContent: false };
  }

  return { cleanText, hadQuotedContent };
}
