import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: inbox } = await sb.from('ops_inbox').select('email_from, email_body, email_subject, created_at')
    .ilike('email_subject', '%Factura Trane para OC6203%')
    .not('email_from', 'ilike', '%notificaciones@centinelia%')
    .order('created_at', { ascending: false }).limit(1);
  const row = (inbox?.[0] as any);
  console.log('subject:', row?.email_subject);
  console.log('from:', row?.email_from);
  console.log('body length:', row?.email_body?.length);
  const body = row?.email_body ?? '';
  // Buscar inicio del XML
  const idxXml = body.toLowerCase().indexOf('<?xml');
  const idxCfdi = body.toLowerCase().indexOf('cfdi:comprobante');
  const idxContenido = body.indexOf('Contenido de documentos adjuntos');
  console.log(`\nposición de "<?xml": ${idxXml}`);
  console.log(`posición de "cfdi:comprobante": ${idxCfdi}`);
  console.log(`posición de "---Contenido---": ${idxContenido}`);
  console.log('\n--- Primeros 2000 chars ---');
  console.log(body.slice(0, 2000));
  console.log('\n--- Chars 2000-4000 ---');
  console.log(body.slice(2000, 4000));
}
main().catch(e => { console.error(e); process.exit(1); });
