// Verifica que Nami ahora toma isabel.galvan@trane.com del config
// sin que Camila tenga que dictarlo. Envía a nazre20@gmail.com para safety.

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const { data: agentRow } = await sb.from('voice_agents').select('*').eq('id', NAMI).maybeSingle();
const { executeAgentTool } = await import('../src/lib/tools/executor.ts');

console.log('── Test 1: borrador SIN override — debe ir a Isabel (config) ──');
const r1 = await executeAgentTool('inv_notificar_trane_registro_oc', {
  oc_numero: 'TEST-VERIFY-' + Date.now(),
  items: [{ modelo: 'TEST-X', cantidad: 1 }],
  enviar: false,
}, {
  agentId: NAMI, portalEmail: PORTAL,
  agentName: agentRow.agent_name, businessName: agentRow.business_name,
  portalToken: 'smoke', agent: agentRow, supabase: sb, channel: 'chat',
});
console.log('  Draft to:', r1?.draft?.to);
const okConfig = r1?.ok && r1?.draft?.to === 'isabel.galvan@trane.com';
console.log(' ', okConfig ? '✓' : '✗', 'Config pickup correcto');

console.log('\n── Test 2: borrador CON override — debe respetar override ──');
const r2 = await executeAgentTool('inv_notificar_trane_registro_oc', {
  oc_numero: 'TEST-OVR-' + Date.now(),
  items: [{ modelo: 'Y', cantidad: 1 }],
  destinatario_email: 'otro@trane.com',
  enviar: false,
}, {
  agentId: NAMI, portalEmail: PORTAL,
  agentName: agentRow.agent_name, businessName: agentRow.business_name,
  portalToken: 'smoke', agent: agentRow, supabase: sb, channel: 'chat',
});
console.log('  Draft to:', r2?.draft?.to);
const okOverride = r2?.ok && r2?.draft?.to === 'otro@trane.com';
console.log(' ', okOverride ? '✓' : '✗', 'Override tiene precedencia');

console.log('\n── Resumen ──');
console.log(okConfig && okOverride ? '✓ Nami lista: usa config por default, override cuando se pasa.' : '✗ Hay problema.');
