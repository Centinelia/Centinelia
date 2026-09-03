// scripts/test-titan-imap.ts
//
// Prueba rápida de conexión IMAP a Titan/GoDaddy. Prueba:
//   1. Password Lorcam2026 con host imap.titan.email
//   2. Password Lorcam2026! con host imap.titan.email
//   3. Fallback con host imap.secureserver.net
//
// USO: npx tsx scripts/test-titan-imap.ts

import { ImapFlow } from 'imapflow';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.local' });

const USER = process.env.TITAN_EMAIL ?? 'hola@centinelia.mx';

async function tryConnect(host: string, password: string, label: string): Promise<{ ok: boolean; error?: string; mailboxes?: number }> {
  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user: USER, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    const list = await client.list();
    await client.logout();
    return { ok: true, mailboxes: list.length };
  } catch (e) {
    try { await client.logout(); } catch { /* ignore */ }
    return { ok: false, error: (e as Error).message };
  }
}

async function main() {
  console.log(`Testing IMAP for ${USER}`);
  console.log('');

  const combinations: Array<{ host: string; password: string; label: string }> = [
    { host: 'imap.titan.email',       password: 'Lorcam2026',  label: 'Titan / Lorcam2026' },
    { host: 'imap.titan.email',       password: 'Lorcam2026!', label: 'Titan / Lorcam2026!' },
    { host: 'imap.secureserver.net',  password: 'Lorcam2026',  label: 'SecureServer / Lorcam2026' },
    { host: 'imap.secureserver.net',  password: 'Lorcam2026!', label: 'SecureServer / Lorcam2026!' },
  ];

  const successful: typeof combinations = [];
  for (const c of combinations) {
    process.stdout.write(`  ${c.label.padEnd(45)}... `);
    const result = await tryConnect(c.host, c.password, c.label);
    if (result.ok) {
      console.log(`OK (${result.mailboxes} mailboxes)`);
      successful.push(c);
    } else {
      console.log(`FAIL — ${result.error}`);
    }
  }

  console.log('');
  if (successful.length === 0) {
    console.error('Ninguna combinación funcionó. Posibles causas:');
    console.error('  - Contraseña incorrecta');
    console.error('  - 2FA activo en la cuenta (Titan/GoDaddy requiere desactivarlo para IMAP)');
    console.error('  - IMAP no habilitado en la cuenta (revisa en el panel GoDaddy)');
    console.error('  - Cuenta bloqueada por intentos fallidos (espera 15 min)');
    process.exit(1);
  }

  console.log('Combinación(es) exitosa(s):');
  for (const c of successful) {
    console.log(`  ${c.host} / password: ${c.password}`);
  }
  console.log('');
  console.log('Actualiza .env.local con la primera que funcionó y estás listo.');
}

main().catch(err => {
  console.error('Unhandled:', err);
  process.exit(1);
});
