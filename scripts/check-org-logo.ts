import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: org } = await sb.from('organizations').select('*').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
  const row = org as any;
  // Buscar campos relacionados con logo
  console.log('Campos relacionados con logo/brand/image:');
  for (const key of Object.keys(row ?? {})) {
    if (/logo|image|avatar|brand|url/i.test(key)) {
      console.log(`  ${key}: ${JSON.stringify(row[key])?.slice(0, 100)}`);
    }
  }
  console.log('\nName/legal:');
  console.log('  name:', row?.name);
  console.log('  legal_name:', row?.legal_name);
  console.log('  business_name:', row?.business_name);
  console.log('  rfc:', row?.rfc);
}
main().catch(e => { console.error(e); process.exit(1); });
