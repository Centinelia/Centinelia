import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: integs } = await sb.from('email_integrations').select('access_token, email').eq('email', 'camila@acproyectos.com');
  const token = (integs?.[0] as any)?.access_token;
  if (!token) { console.log('No token'); return; }

  // Buscar en Inbox folder
  const inboxUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=receivedDateTime gt 2026-10-07T18:00:00Z&$select=subject,from,receivedDateTime,hasAttachments&$top=20&$orderby=receivedDateTime desc`;
  const r1 = await fetch(inboxUrl, { headers: { Authorization: `Bearer ${token}` } });
  const d1 = await r1.json();
  console.log(`\nINBOX folder (desde 18:00): ${d1.value?.length ?? 0}`);
  for (const m of (d1.value ?? [])) {
    console.log(`  ${(m.receivedDateTime ?? '').slice(11, 19)}  from=${(m.from?.emailAddress?.address ?? '').slice(0, 40)}  subj=${(m.subject ?? '').slice(0, 70)}  attach=${m.hasAttachments}`);
  }

  // Buscar en Junk folder
  const junkUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/JunkEmail/messages?$filter=receivedDateTime gt 2026-10-07T18:00:00Z&$select=subject,from,receivedDateTime&$top=20&$orderby=receivedDateTime desc`;
  const r2 = await fetch(junkUrl, { headers: { Authorization: `Bearer ${token}` } });
  const d2 = await r2.json();
  console.log(`\nJUNK folder (desde 18:00): ${d2.value?.length ?? 0}`);
  for (const m of (d2.value ?? [])) {
    console.log(`  ${(m.receivedDateTime ?? '').slice(11, 19)}  from=${(m.from?.emailAddress?.address ?? '').slice(0, 40)}  subj=${(m.subject ?? '').slice(0, 70)}`);
  }

  // Buscar en TODAS las carpetas by subject TEST
  const searchUrl = `https://graph.microsoft.com/v1.0/me/messages?$search="TEST-99999"&$select=subject,from,receivedDateTime,parentFolderId&$top=10`;
  const r3 = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' } });
  const d3 = await r3.json();
  console.log(`\nSEARCH "TEST-99999" todas las carpetas: ${d3.value?.length ?? 0}`);
  for (const m of (d3.value ?? [])) {
    console.log(`  ${(m.receivedDateTime ?? '').slice(0, 19)}  from=${(m.from?.emailAddress?.address ?? '').slice(0, 40)}  subj=${(m.subject ?? '').slice(0, 70)}  folder=${m.parentFolderId}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
