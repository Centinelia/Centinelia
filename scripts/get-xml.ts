import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: inbox } = await sb.from('ops_inbox').select('email_body, email_subject')
    .ilike('email_subject', '%Factura Trane para OC6203%')
    .order('created_at', { ascending: false }).limit(1);
  const body = (inbox?.[0] as any)?.email_body ?? '';
  console.log('body length:', body.length);
  // Buscar el XML
  const xmlStart = body.indexOf('<?xml') >= 0 ? body.indexOf('<?xml') : body.indexOf('<cfdi:Comprobante');
  if (xmlStart < 0) {
    console.log('No se encontró XML en body');
    console.log('Preview:', body.slice(0, 2000));
    return;
  }
  const xmlEnd = body.indexOf('</cfdi:Comprobante>') + '</cfdi:Comprobante>'.length;
  const xml = body.slice(xmlStart, xmlEnd > 0 ? xmlEnd : body.length);
  console.log('\n--- XML (primeros 4000 chars) ---');
  console.log(xml.slice(0, 4000));
  console.log('\n--- Conceptos (match descripción) ---');
  const descMatches = xml.match(/Descripcion="([^"]+)"/g) ?? xml.match(/<cfdi:Descripcion>([^<]+)/g) ?? [];
  for (const d of descMatches) console.log(d);
}
main().catch(e => { console.error(e); process.exit(1); });
