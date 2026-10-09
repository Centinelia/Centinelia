import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data, error } = await sb.from('voice_agents')
    .update({ approval_email: 'hola@centinelia.mx' })
    .eq('portal_email', 'camila@acproyectos.com')
    .eq('agent_name', 'Nami')
    .select('id, agent_name, approval_email');
  if (error) { console.error(error); process.exit(1); }
  console.log('Updated:', JSON.stringify(data, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
