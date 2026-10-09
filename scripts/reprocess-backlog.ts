/**
 * Descarga PDF backlog del attachment real y corre inv_importar_backlog
 * pasando los bytes directamente (bypass del pdf_url http).
 */
import './_bootstrap';

async function main() {
  const dryRun = !process.argv.includes('--apply');
  const mode: 'upsert' | 'replace' = (process.argv.includes('--replace') ? 'replace' : 'upsert');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'} | strategy: ${mode}`);

  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { parseBacklogPdf } = await import('../src/lib/inventory/backlog-parser');
  const { syncBacklogRows } = await import('../src/lib/inventory/backlog-syncer');
  const { resolveInventoryContext } = await import('../src/lib/inventory/adapter');
  const sb = createAdminClient();

  const { data: agent } = await sb.from('voice_agents').select('*')
    .eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami').single();
  const a = agent as any;

  const { data: inbox } = await sb.from('ops_inbox')
    .select('id, raw_message_id, email_subject, attachments')
    .eq('agent_id', a.id)
    .ilike('email_subject', 'Backlog Actualizado')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  const row = inbox as any;
  const pdfAtt = (row.attachments ?? []).find((x: any) => /\.pdf$/i.test(x.name));
  if (!pdfAtt) throw new Error('No PDF attachment');
  console.log(`PDF: ${pdfAtt.name} (${Math.round(pdfAtt.size / 1024)}KB)`);

  const { data: integ } = await sb.from('email_integrations').select('access_token')
    .eq('agent_id', a.id).eq('provider', 'outlook').maybeSingle();
  const token = (integ as any)?.access_token;
  if (!token) throw new Error('No token');

  const listUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(row.raw_message_id)}/attachments`;
  const list = await (await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } })).json();
  const graphAtt = list.value?.find((x: any) => /\.pdf$/i.test(x.name));
  if (!graphAtt) throw new Error('No PDF en Graph');

  const dl = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(row.raw_message_id)}/attachments/${encodeURIComponent(graphAtt.id)}/$value`, { headers: { Authorization: `Bearer ${token}` } });
  const pdfBytes = new Uint8Array(await dl.arrayBuffer());
  console.log(`Downloaded: ${pdfBytes.length} bytes`);

  console.log('\nParseando con password 595170...');
  const parsed = await parseBacklogPdf(pdfBytes, '595170');
  console.log(`  rows parseadas: ${parsed.rows.length}`);
  console.log(`  first row sample:`, JSON.stringify(parsed.rows[0] ?? {}, null, 2).slice(0, 400));

  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, a.id);
  if ('error' in ctx) throw new Error(`inv context: ${(ctx as any).error}`);
  const sheetCfg = (ctx as any).config.sheets?.backlog;
  console.log(`\nsheet config: ${JSON.stringify(sheetCfg)}`);

  console.log(`\nSync (dryRun=${dryRun}, mode=${mode})...`);
  const summary = await syncBacklogRows(ctx as any, sheetCfg, parsed.rows, { dryRun, mode });
  console.log('\n--- SUMMARY ---');
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
