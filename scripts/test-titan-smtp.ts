// scripts/test-titan-smtp.ts — verifica que SMTP funciona enviando un correo
// de prueba a la misma dirección.

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { sendViaTitan } from '../src/lib/email/titan-smtp';

async function main() {
  const to = process.env.TITAN_EMAIL ?? 'hola@centinelia.mx';
  console.log(`Enviando correo de prueba a ${to}...`);

  const result = await sendViaTitan({
    to,
    subject: '[Test] Nala IMAP+SMTP setup verificación',
    html: '<p>Este es un correo de prueba enviado por el nuevo cron <code>nala-mailbox</code>.</p><p>Si estás leyendo esto, SMTP via GoDaddy funciona.</p><p>Puedes borrarlo.</p>',
    text: 'Test de setup IMAP+SMTP Nala. SMTP funciona si estás leyendo esto.',
    fromDisplay: 'Nala Centinelia',
    saveToSent: true,
  });

  console.log('');
  console.log('Resultado:', JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error('Unhandled:', err);
  process.exit(1);
});
