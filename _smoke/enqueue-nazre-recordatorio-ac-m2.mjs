// Encola recordatorio durable en email_send_jobs para 2026-10-26 9:07 AM Monterrey.
// Fire via Nash (agente interno Centinelia). Vercel cron process-email-jobs
// corre cada minuto y lo recoge cuando next_attempt_at <= NOW().
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NASH_ID = '731675a6-bcbe-4657-bba5-e9674bcfb581';
const NASH_PORTAL = 'hola@centinelia.mx';
const SEND_AT_UTC = '2026-10-26T15:07:00Z'; // = 9:07 AM Monterrey (UTC-6)
const SOURCE = 'nazre_reminder_ac_m2_2026-10-09';

// Idempotencia: no insertar si ya existe uno con mismo source.
const { data: existing } = await sb.from('email_send_jobs')
  .select('id, status, next_attempt_at')
  .eq('source', SOURCE)
  .limit(1);
if (existing?.length) {
  console.log('Ya existe el job con este source:');
  console.table(existing);
  console.log('Si quieres re-encolar, borra la fila existente primero.');
  process.exit(0);
}

const subject = 'Recordatorio: timbrar Mensualidad 2 de 4 AC Proyectos esta semana';
const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1A0A3B; line-height: 1.6; max-width: 620px; margin: 24px auto; padding: 0 16px;">
  <h2 style="color: #6C3BFF; margin-bottom: 4px;">Timbrar Mensualidad 2 de 4 AC Proyectos</h2>
  <p style="color: rgba(26,10,59,0.6); font-size: 13px; margin-top: 0;">Recordatorio automático de Nash. Ventana de cobro: 2026-10-28 al 2026-11-01.</p>

  <p>Esta semana toca timbrar la Mensualidad 2 de 4 de AC Proyectos.</p>

  <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; border: 1px solid #E6E0F5; margin: 16px 0;">
    <tr style="background: #F0ECFF;">
      <td style="font-weight: bold;">Monto</td>
      <td>$23,200 (20,000 subtotal + 3,200 IVA)</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">Concepto</td>
      <td>Mensualidad 2 de 4 - periodo octubre 2026</td>
    </tr>
    <tr style="background: #F0ECFF;">
      <td style="font-weight: bold;">Receptor</td>
      <td>AIRE ACONDICIONADO PROYECTOS - RFC AAP010601S21</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">Contacto finanzas</td>
      <td>Tania - tania@acproyectos.com</td>
    </tr>
    <tr style="background: #F0ECFF;">
      <td style="font-weight: bold;">ClaveProdServ</td>
      <td>81111500 (nuevo vs 1/4)</td>
    </tr>
  </table>

  <h3 style="margin-top: 24px; margin-bottom: 8px;">Pasos</h3>
  <ol>
    <li>Si Tania aún no recibió recordatorio del depósito, mándaselo hoy mismo desde hola@centinelia.mx.</li>
    <li>Cuando confirme el depósito, correr el comando de timbrado documentado en <code>scripts/configs/README.md</code>.</li>
    <li>Verificar el PDF/XML en el Dropbox del cliente antes de notificar a Nazre.</li>
  </ol>

  <h3 style="margin-top: 24px; margin-bottom: 8px;">Comando</h3>
  <pre style="background: #FAFBFF; border: 1px solid #E6E0F5; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto;">cd C:/Users/Nazre/centinelia
npx tsx scripts/facturama-emitir-ingreso.ts \\
  --config=.claude/worktrees/nami-fase1-inventory-writers/scripts/configs/ac-proyectos-mensualidad-2.cfdi.json \\
  --prod \\
  --email=tania@acproyectos.com \\
  --out="C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Facturación/Factura_2026-10_Centinelia_a_ACProyectos_Nami-Mensualidad2-de-4"</pre>

  <p style="color: rgba(26,10,59,0.6); font-size: 13px; margin-top: 24px;">Decisión formal del ciclo de facturación: <code>.brain/decisions/2026-10-09-facturacion-dia-1-del-mes-standard.md</code>.</p>

  <p style="color: rgba(26,10,59,0.4); font-size: 12px; margin-top: 32px; border-top: 1px solid #E6E0F5; padding-top: 12px;">Nash - Operaciones internas Centinelia</p>
</body>
</html>`;

const { data, error } = await sb.from('email_send_jobs').insert({
  agent_id:        NASH_ID,
  portal_email:    NASH_PORTAL,
  to_addr:         'nazre20@gmail.com',
  subject,
  html,
  status:          'pending',
  next_attempt_at: SEND_AT_UTC,
  source:          SOURCE,
  reply_to:        null,
  from_addr:       null,
  attachment_url:  null,
  attachment_name: null,
  attachment_mime: null,
  reference_id:    'ac-m2-2026-10-09',
  charge_source:   null,
  charge_label:    null,
  source_table:    null,
  source_row_id:   null,
  attempts:        0,
  max_attempts:    5,
}).select('id, next_attempt_at, status, source').single();

if (error) {
  console.error('Error insertando job:', error);
  process.exit(1);
}
console.log('OK. Email job encolado:');
console.table([data]);
console.log('\nDispara automáticamente al llegar a next_attempt_at.');
console.log('Para cancelar: UPDATE email_send_jobs SET status=\'cancelled\' WHERE id=\'' + data.id + '\';');
