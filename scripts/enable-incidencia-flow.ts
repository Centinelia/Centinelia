import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const PORTAL_EMAIL = 'servicioalcliente@tortillaestrella.com.mx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('organizations')
    .update({ incidencia_flow_enabled: true })
    .eq('portal_email', PORTAL_EMAIL);
  if (error) { console.error(error); process.exit(1); }
  console.log('incidencia_flow_enabled=true for', PORTAL_EMAIL);
}
main().catch(err => { console.error(err); process.exit(1); });
