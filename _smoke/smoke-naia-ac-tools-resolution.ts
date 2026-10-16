/**
 * Smoke de "¿Naia-AC puede ver las tools rrhh_*?" en los 3 canales.
 *
 * NO ejecuta el LLM, pero sí ejecuta la cadena real de resolución que hace
 * el repo: pack context → packs activos → preset del rol → overrides →
 * EMAIL/CHAT/VOICE_TOOL_BY_NAME. Si todas las 5 llegan en los 3 canales,
 * el LLM las puede invocar. Si falta alguna, el modelo las aluciona (bug
 * #1 recurrente de Centinelia).
 *
 * Caza drift silencioso: ej. si olvidamos agregar una tool a CHAT_TOOL_BY_NAME
 * aunque esté en el executor + registry, este smoke lo detecta antes de que
 * Lucero descubra que Naia "no sabe hacer X".
 *
 * Uso: npx tsx _smoke/smoke-naia-ac-tools-resolution.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { resolveOrgPackContext, meerkatActivePacks, SKILL_PACKS, TOOL_TO_PACK, filterByActivePacks } from '../src/lib/tools/packs';
import { applyToolOverrides, parseToolOverrides } from '../src/lib/tools/tool-overrides';
import { CHAT_TOOL_BY_NAME } from '../src/app/api/portal/[token]/agent-chat/route';
import { EMAIL_TOOL_BY_NAME, MEERKAT_EMAIL_DISTRIBUTION } from '../src/lib/ops/inbox-processor';
import { MEERKAT_VOICE_DISTRIBUTION, UNIVERSAL_VOICE_TOOLS } from '../src/lib/vapi/sync';
import { UNIVERSAL_TOOLS } from '../src/lib/tools/channel-mapping';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const PORTAL_EMAIL = 'camila@acproyectos.com';
const RRHH_TOOLS = [
  'rrhh_registrar_empleado',
  'rrhh_dar_baja_empleado',
  'rrhh_registrar_descansos_mensuales',
  'rrhh_registrar_vacaciones_autorizadas',
  'rrhh_procesar_quincena_desde_excel',
];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('[smoke-tools] FAIL:', msg); process.exit(1); }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta env'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('[smoke-tools] ─── 1. Pack hr_nomina activo para AC ──');
  const ctx = await resolveOrgPackContext(PORTAL_EMAIL, supabase);
  console.log('   has_hr_nomina:', ctx.has_hr_nomina);
  assert(ctx.has_hr_nomina === true, 'has_hr_nomina debe ser true (organizations.features.rrhh_nomina_v1)');

  const hrNominaPack = SKILL_PACKS.find(p => p.id === 'hr_nomina');
  assert(hrNominaPack, 'pack hr_nomina no encontrado en SKILL_PACKS');
  assert(hrNominaPack.activeCheck(ctx) === true, 'pack hr_nomina debe estar activo');
  console.log(`   pack hr_nomina: tools = [${hrNominaPack.tools.join(', ')}]`);

  console.log('\n[smoke-tools] ─── 2. Las 5 tools en TOOL_TO_PACK ──');
  for (const t of RRHH_TOOLS) {
    const pack = TOOL_TO_PACK[t];
    const ok = pack === 'hr_nomina';
    console.log(`   ${ok ? '✓' : '✗'} ${t.padEnd(44)} pack = ${pack ?? 'NINGUNO'}`);
    assert(ok, `${t} debe pertenecer al pack hr_nomina`);
  }

  console.log('\n[smoke-tools] ─── 3. Las 5 tools en CHAT_TOOL_BY_NAME ──');
  for (const t of RRHH_TOOLS) {
    const def = CHAT_TOOL_BY_NAME[t];
    const ok = !!def && def.name === t;
    console.log(`   ${ok ? '✓' : '✗'} ${t.padEnd(44)} chat def = ${def ? 'presente' : 'FALTA'}`);
    assert(ok, `${t} debe tener schema en CHAT_TOOL_BY_NAME`);
  }

  console.log('\n[smoke-tools] ─── 4. Las 5 tools en EMAIL_TOOL_BY_NAME ──');
  for (const t of RRHH_TOOLS) {
    const def = EMAIL_TOOL_BY_NAME[t];
    const ok = !!def && def.name === t;
    console.log(`   ${ok ? '✓' : '✗'} ${t.padEnd(44)} email def = ${def ? 'presente' : 'FALTA'}`);
    assert(ok, `${t} debe tener schema en EMAIL_TOOL_BY_NAME`);
  }

  console.log('\n[smoke-tools] ─── 5. Resolver tools para Naia-AC via patrón real ──');
  // Simula el flow exacto del inbox-processor: preset → filterByActivePacks → applyToolOverrides.
  const { data: agent, error } = await supabase.from('voice_agents')
    .select('id, agent_name, features, tool_overrides')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('features->>meerkat_role_id', 'naia')
    .single();
  assert(!error && agent, `agente Naia AC no encontrado: ${error?.message}`);
  console.log(`   Agente Naia AC: ${agent.id} (${agent.agent_name})`);

  const meerkatFeatures = agent.features as Record<string, unknown>;
  const orgActivePacks = new Set(SKILL_PACKS.filter(p => p.activeCheck(ctx)).map(p => p.id));
  const effectivePacks = meerkatActivePacks(orgActivePacks, meerkatFeatures);
  console.log(`   Packs activos para Naia AC: [${[...effectivePacks].join(', ')}]`);
  assert(effectivePacks.has('hr_nomina'), 'hr_nomina debe estar en packs activos del meerkat');

  // Email: preset de Naia + universales → filtra packs → aplica overrides.
  const emailPreset = (MEERKAT_EMAIL_DISTRIBUTION.naia ?? []).concat(UNIVERSAL_TOOLS);
  const emailPresetTools = Array.from(new Set(emailPreset)).map(n => EMAIL_TOOL_BY_NAME[n]).filter(Boolean);
  const emailPackFiltered = emailPresetTools.filter(t => {
    const packId = TOOL_TO_PACK[t.name];
    return !packId || effectivePacks.has(packId);
  });
  const overrides = parseToolOverrides(agent.tool_overrides);
  const emailFinal = applyToolOverrides(emailPackFiltered, overrides, name => {
    const packId = TOOL_TO_PACK[name];
    if (packId && !effectivePacks.has(packId)) return undefined;
    return EMAIL_TOOL_BY_NAME[name];
  });
  const emailNames = new Set(emailFinal.map(t => t.name));
  console.log(`   Email tools finales: ${emailFinal.length}`);
  for (const t of RRHH_TOOLS) {
    const ok = emailNames.has(t);
    console.log(`     ${ok ? '✓' : '✗'} ${t}`);
    assert(ok, `${t} debe estar en email final para Naia AC`);
  }

  // Chat: mismo patrón pero con CHAT_TOOL_BY_NAME. Preset de voice equivale a chat según el repo.
  const chatPreset = (MEERKAT_VOICE_DISTRIBUTION.naia ?? []).concat(UNIVERSAL_VOICE_TOOLS);
  const chatPresetTools = Array.from(new Set(chatPreset)).map(n => CHAT_TOOL_BY_NAME[n]).filter(Boolean);
  const chatPackFiltered = chatPresetTools.filter(t => {
    const packId = TOOL_TO_PACK[t.name];
    return !packId || effectivePacks.has(packId);
  });
  const chatFinal = applyToolOverrides(chatPackFiltered, overrides, name => {
    const packId = TOOL_TO_PACK[name];
    if (packId && !effectivePacks.has(packId)) return undefined;
    return CHAT_TOOL_BY_NAME[name];
  });
  const chatNames = new Set(chatFinal.map(t => t.name));
  console.log(`   Chat tools finales: ${chatFinal.length}`);
  for (const t of RRHH_TOOLS) {
    const ok = chatNames.has(t);
    console.log(`     ${ok ? '✓' : '✗'} ${t}`);
    assert(ok, `${t} debe estar en chat final para Naia AC`);
  }

  console.log('\n[smoke-tools] ✓ TODO PASÓ. Las 5 tools rrhh_* llegan al LLM en chat + email para Naia AC.');
  console.log('[smoke-tools]   Voz: tools dispatched via buildToolDef + exec/[toolName] endpoint. Validado en smoke-rrhh-4-grupos (prod).');
}

main().catch(err => { console.error('[smoke-tools] ERROR:', err); process.exit(1); });
