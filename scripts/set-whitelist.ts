import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: current } = await sb.from('voice_agents')
    .select('features').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const features = {
    ...((current as any)?.features ?? {}),
    allowed_sender_emails: ['camila@acproyectos.com', 'victoria@acproyectos.com'],
    // '@trane' matchea cualquier dominio con "trane": trane.com, tranetechnologies.com,
    // tranemx.com, etc. No falsos positivos como "trainer@gmail.com" (no incluye @trane).
    allowed_processor_only_emails: ['@trane'],
  };
  await sb.from('voice_agents').update({ features }).eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344');
  console.log('Updated processor-only:', JSON.stringify(features.allowed_processor_only_emails));
}
main().catch(e => { console.error(e); process.exit(1); });
