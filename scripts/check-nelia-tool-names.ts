import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const VAPI_ASSISTANT_ID = '78f35a57-49c8-46d6-ba1d-0de64060d082';

async function main() {
  const key = process.env.VAPI_API_KEY;
  if (!key) { console.error('VAPI_API_KEY missing'); process.exit(1); }

  const res = await fetch(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  const toolIds: string[] = data?.model?.toolIds ?? [];
  console.log('Nelia toolIds:', toolIds.length);
  for (const id of toolIds) {
    const r = await fetch(`https://api.vapi.ai/tool/${id}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) { console.log(id, 'ERR', r.status); continue; }
    const j = await r.json();
    console.log(' ', j?.function?.name ?? j?.name ?? '?');
  }
}
main().catch(err => { console.error(err); process.exit(1); });
