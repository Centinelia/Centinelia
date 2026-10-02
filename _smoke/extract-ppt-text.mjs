// Extract text from the Camila presentation PDF to compare against Nami's current behavior.
import fs from 'node:fs';
const { extractText } = await import('unpdf');
const bytes = new Uint8Array(fs.readFileSync('C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Presentación - Inventarios AC proyectos.pdf'));
const result = await extractText(bytes, { mergePages: false });
console.log('Pages:', result.totalPages);
for (let i = 0; i < result.text.length; i++) {
  const text = result.text[i].trim();
  if (text) {
    console.log(`\n──── Página ${i + 1} ────`);
    console.log(text.slice(0, 2000));
  }
}
