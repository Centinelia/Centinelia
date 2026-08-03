/**
 * F3 preview: render a GenericDocPDF with markdown content + Pneuma Studio
 * brand color (#14b8a6, teal). Save the buffer to disk so we can eyeball
 * whether markdown parses AND brand color shows up.
 */
import { loadEnv } from './_env';
loadEnv();
import { writeFileSync } from 'fs';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { GenericDocPDF, ProposalPDF } from '../../src/lib/pdf/doc';

const brand = {
  businessName:   'Pneuma Studio',
  logoUrl:        null,
  color:          '#14b8a6',              // teal — brand real de la org
  colorSecondary: '#5cffec',
  phone:          '+18124899525',
  website:        'pneumastudio.mx',
  address:        'Monterrey, NL',
  footerText:     null,
};

const MD_CONTENT = `# Encabezado principal
Este es un párrafo con texto normal y una **palabra en negrita** y también *cursiva*.

## Subsección
Aquí hay una lista de tres puntos:
- Primer bullet con **énfasis**
- Segundo bullet
- Tercer bullet con \`código inline\` (no soportado, sale plain)

## Otra sección
Un párrafo largo para probar que el flujo se ve bien. Los meerkats de Centinelia escriben este tipo de output cuando les pides una cotización o carta. Antes salía todo con los símbolos \`#\` y \`**\` literales; ahora debe renderizar con headings colorados y **negritas** reales.

> Esto es un blockquote de una línea.

1. Numerado uno
2. Numerado dos con *italic*
3. Numerado tres
`;

async function main() {
  const doc = createElement(GenericDocPDF, {
    brand,
    title:   'Cotización de servicios — Pneuma Studio',
    content: MD_CONTENT,
  });

  const buf = await renderToBuffer(doc);
  writeFileSync('doc-preview.pdf', buf as unknown as Uint8Array);
  console.log(`Wrote doc-preview.pdf (${buf.length} bytes).`);
  console.log('Abrilo para verificar: headings en teal, bullets con •, negritas, cursivas, blockquote indent.');

  // Also test ProposalPDF path
  const prop = createElement(ProposalPDF, {
    brand,
    title:        'Propuesta comercial',
    content:      MD_CONTENT,
    clientName:   'Test Cliente SA',
    clientEmail:  'test@cliente.mx',
    totalPrice:   '$55,000 MXN',
    validityDays: 15,
  });
  const buf2 = await renderToBuffer(prop);
  writeFileSync('proposal-preview.pdf', buf2 as unknown as Uint8Array);
  console.log(`Wrote proposal-preview.pdf (${buf2.length} bytes).`);
}
main().catch(err => { console.error(err); process.exit(1); });
