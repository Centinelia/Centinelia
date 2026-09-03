// scripts/test-nala-signature.ts — manda un correo test vía Titan SMTP
// para iterar la firma de Nala sin gastar folios de Facturama.
//
// USO: npx tsx scripts/test-nala-signature.ts [correo-destino]

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { nalaCfdiSender } from '../src/lib/ops/nala-cfdi-sender';

// Reemplaza URL absoluta del avatar por data URI base64 inline
// (evita 404 cuando el asset no está deployado a prod aún)
const originalFetch = global.fetch;

function inlineAvatar(html: string): string {
  const avatarPath = join(process.cwd(), 'public', 'meerkats', 'nala-avatar.png');
  if (!existsSync(avatarPath)) return html;
  const buf = readFileSync(avatarPath);
  const dataUri = `data:image/png;base64,${buf.toString('base64')}`;
  return html
    .replace(/https:\/\/[^"']+\/meerkats\/nala-avatar\.png/g, dataUri)
    .replace(/http:\/\/[^"']+\/meerkats\/nala-avatar\.png/g, dataUri);
}

async function main() {
  const to = process.argv[2] ?? process.env.NAZRE_ADMIN_EMAIL ?? 'nazre20@gmail.com';
  console.log(`Enviando test de firma Nala a ${to}...`);

  // Cuerpo dummy para simular un correo real de Nala
  const body = `<p>Hola,</p>
<p>Este es un <strong>correo de prueba</strong> para revisar cómo se ve mi firma. No hay factura adjunta, solo estoy probando el diseño del correo.</p>
<p>Si algo se ve raro, Nazre lo ajusta.</p>
<p><span style="color:#8C7FB8;font-size:11px">Test ${new Date().toISOString().slice(11, 19)}</span></p>`;

  // Wrap sender para inline data URI (bypass 404 en prod aún no deployado)
  const wrapped: typeof nalaCfdiSender = async (input) => {
    return nalaCfdiSender({ ...input, html: inlineAvatar(input.html) });
  };

  const ok = await wrapped({
    to,
    subject: `[Test firma Nala] ${new Date().toLocaleTimeString('es-MX')}`,
    html: body,
    attachments: [],
  });

  console.log(ok ? '✓ Enviado' : '✗ Falló');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error('Unhandled:', err);
  process.exit(1);
});
