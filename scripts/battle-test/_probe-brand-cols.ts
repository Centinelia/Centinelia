import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  for (const col of ['brand_color', 'email_brand_color', 'brand_color_secondary', 'logo_url', 'email_logo_url', 'brand_website', 'brand_address', 'email_footer_text', 'phone_number']) {
    const r = await s.from('voice_agents').select(`id, ${col}`).eq('id', '9a0c935a-2b47-432a-a2c3-c67bbf915905').single();
    console.log(`voice_agents.${col}:`, r.error ? `❌ ${r.error.message}` : `✅ ${JSON.stringify(r.data?.[col])}`);
  }
  const a = { data: null, error: null } as any;
  console.log('voice_agents:', { data: a.data, error: a.error?.message });

  const o = await s.from('organizations').select('portal_email, email_brand_color, brand_color_secondary').eq('portal_email', 'studio@pneumastudio.mx').single();
  console.log('organizations:', { data: o.data, error: o.error?.message });
}
main().catch(err => { console.error(err); process.exit(1); });
