import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('voice_agents').update({ approval_email: null })
    .eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami').select('id, approval_email');
  console.log('updated:', JSON.stringify(data));
}
main().catch(e => console.error(e));
