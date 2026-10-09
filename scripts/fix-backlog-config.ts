import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const PE = 'camila@acproyectos.com';
  const { data: org, error } = await sb.from('organizations').select('portal_email, name, inventory_excel_config').eq('portal_email', PE).single();
  if (error) { console.error(error); process.exit(1); }
  const cfg = ((org as any)?.inventory_excel_config ?? {}) as Record<string, any>;
  console.log(`org: ${(org as any).name}  portal_email: ${PE}`);
  console.log('current backlog_trane:', JSON.stringify(cfg.backlog_trane ?? '(none)'));
  console.log('current sheets.backlog:', JSON.stringify(cfg.sheets?.backlog ?? '(none)'));
  console.log('current sheets keys:', Object.keys(cfg.sheets ?? {}).join(', '));

  if (process.argv.includes('--apply')) {
    const newCfg = {
      ...cfg,
      backlog_trane: { ...(cfg.backlog_trane ?? {}), pdf_password: '595170' },
      sheets: { ...(cfg.sheets ?? {}), backlog: { name: 'BACKLOG', start_row: 2 } },
    };
    const { error: upErr } = await sb.from('organizations').update({ inventory_excel_config: newCfg }).eq('portal_email', PE);
    if (upErr) { console.error(upErr); process.exit(1); }
    console.log('\n✓ APLICADO: backlog_trane.pdf_password=595170, sheets.backlog={name:BACKLOG,start_row:2}');
  } else {
    console.log('\nDRY-RUN. Pasa --apply.');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
