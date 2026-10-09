import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: integs } = await sb.from('email_integrations').select('access_token').eq('email', 'camila@acproyectos.com');
  const token = (integs?.[0] as any)?.access_token;

  // Buscar el correo TEST-88888 directo en Graph API con attachments
  const url = `https://graph.microsoft.com/v1.0/me/messages?$search="TEST-88888"&$select=subject,hasAttachments,id&$top=5&$expand=attachments($select=name,contentType,size)`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' } });
  const d = await r.json();
  console.log('Graph API TEST-88888 (con attachments expandidos):');
  for (const m of d.value ?? []) {
    console.log(`  subj: ${m.subject}`);
    console.log(`  hasAttachments: ${m.hasAttachments}`);
    console.log(`  attachments: ${JSON.stringify(m.attachments ?? [])}`);
    console.log();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
