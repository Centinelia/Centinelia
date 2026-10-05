// Audita que todos los phone numbers de Vapi tengan serverUrl apuntando a
// /api/voice/inbound (no /api/voice/webhook). El PATCH equivocado del
// serverUrl del phone number desactiva TODA la lógica de inbound/route.ts:
// business hours, suspended account, pool exhausted, blocked_numbers.
//
// Bug detonante 2026-10-05: Nelia Tortillería tenía serverUrl=/webhook, el
// bot +524691269029 pasaba el blocklist porque el hook nunca corría. Ver
// src/lib/vapi/__tests__/phone-serverurl-regression.test.ts.
//
// Uso:
//   npx dotenv-cli -e .env.local -- node scripts/audit-vapi-phone-serverurls.mjs
//
// Salida:
//   - Lista de phones correctos (serverUrl → /inbound) con nombre + número
//   - Lista de phones rotos (serverUrl → /webhook o distinto) para arreglar
//   - Exit code 1 si hay alguno roto (útil para CI/cron)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function main() {
  // 1. Lista de phones en Vapi
  const listRes = await fetch('https://api.vapi.ai/phone-number', {
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  });
  if (!listRes.ok) {
    console.error(`✗ Vapi list failed: ${listRes.status}`);
    process.exit(1);
  }
  const phones = await listRes.json();

  // 2. Agents activos con vapi_phone_number_id para cruzar con portal_email
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('agent_name, portal_email, phone_number, vapi_phone_number_id')
    .eq('active', true)
    .not('vapi_phone_number_id', 'is', null);

  const agentByVapiId = new Map();
  for (const a of agents ?? []) {
    const existing = agentByVapiId.get(a.vapi_phone_number_id) ?? [];
    existing.push(a);
    agentByVapiId.set(a.vapi_phone_number_id, existing);
  }

  // 3. Clasificar cada phone
  const correct = [];
  const broken  = [];
  for (const p of phones) {
    const url = p.serverUrl || '';
    const owners = agentByVapiId.get(p.id) ?? [];
    const row = { id: p.id, number: p.number, name: p.name || '(sin nombre)', owners, serverUrl: url };
    if (url.includes('/api/voice/inbound')) correct.push(row);
    else                                     broken.push(row);
  }

  console.log(`\n✓ Correctos (serverUrl → /inbound): ${correct.length}`);
  for (const r of correct) {
    const ownersLabel = r.owners.length
      ? r.owners.map(o => `${o.agent_name}/${o.portal_email}`).join(', ')
      : '(sin agent asignado)';
    console.log(`  ${r.number} — ${r.name} — ${ownersLabel}`);
  }

  if (broken.length === 0) {
    console.log('\n✓ Todos los phones apuntan correctamente a /inbound.');
    return;
  }

  console.log(`\n✗ ROTOS (serverUrl → NO es /inbound): ${broken.length}`);
  for (const r of broken) {
    const ownersLabel = r.owners.length
      ? r.owners.map(o => `${o.agent_name}/${o.portal_email}`).join(', ')
      : '(sin agent asignado)';
    console.log(`  ${r.number} — ${r.name} — ${ownersLabel}`);
    console.log(`    serverUrl actual: ${r.serverUrl}`);
  }

  console.log(`\nPara arreglar: ejecuta assignAssistantToPhone(phone, assistantId) via /api/admin/agentes, o PATCH directo:`);
  console.log(`  PATCH https://api.vapi.ai/phone-number/{id}  { "serverUrl": "<APP_URL>/api/voice/inbound?secret=<SECRET>" }`);

  process.exit(1);
}

main().catch(err => {
  console.error('✗', err.message || err);
  process.exit(1);
});
