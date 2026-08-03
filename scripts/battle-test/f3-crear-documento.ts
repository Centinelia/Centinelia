/**
 * F3 battle test: chat with Sofia asking her to generate a factura for a
 * fake client. Verify (a) tool call happens, (b) row lands in ops_documents
 * with expiry_date ~30 days out.
 */
import { loadEnv } from './_env';
loadEnv();
import { battleChat } from './battle-chat';
import { createClient } from '@supabase/supabase-js';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const PORTAL_EMAIL = 'studio@pneumastudio.mx';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const before = (await s.from('ops_documents').select('id', { count: 'exact', head: true }).eq('portal_email', PORTAL_EMAIL)).count ?? 0;
  console.log(`ops_documents rows before: ${before}`);

  const t = await battleChat({
    agentId: SOFIA_ID,
    message: 'Genera una factura profesional para el cliente Juan Pérez de Comercializadora Norte SA, RFC ABC010101ABC, con 3 conceptos: Diseño de tienda Shopify $30,000, Configuración WhatsApp Business $15,000, Migración de catálogo $10,000. Todo en MXN.',
  });

  console.log('\n\n--- TEXT SUMMARY ---');
  console.log(t.text.slice(0, 400));

  await new Promise(r => setTimeout(r, 3000));

  const { data: run } = await s.from('agent_runs')
    .select('tools_called, llm_calls, duration_ms')
    .eq('agent_id', SOFIA_ID)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  console.log('\nagent_runs.tools_called:', run?.tools_called);

  const { data: docs } = await s.from('ops_documents')
    .select('id, kind, folio, client_name, total_amount, expiry_date, created_at')
    .eq('portal_email', PORTAL_EMAIL)
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\nRecent ops_documents:');
  for (const d of docs ?? []) {
    console.log(`  - ${d.kind ?? '?'} ${d.folio ?? '?'} | ${d.client_name ?? '?'} | $${d.total_amount ?? '?'} | expires ${d.expiry_date}`);
  }

  const after = (await s.from('ops_documents').select('id', { count: 'exact', head: true }).eq('portal_email', PORTAL_EMAIL)).count ?? 0;
  console.log(`\nNew ops_documents rows: ${after - before}`);
}
main().catch(err => { console.error(err); process.exit(1); });
