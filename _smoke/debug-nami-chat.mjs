// One-shot: inspect Nami + AC Proyectos for null/malformed fields
// that could crash agent-chat handler.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('=');
  return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const NAMI_ID = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const PORTAL_EMAIL = 'camila@acproyectos.com';

const { data: nami, error: e1 } = await supabase.from('voice_agents').select('*').eq('id', NAMI_ID).single();
if (e1) { console.error('agent err', e1); process.exit(1); }

console.log('=== NAMI CORE FIELDS ===');
console.log('id:', nami.id);
console.log('agent_name:', nami.agent_name);
console.log('role:', nami.role);
console.log('business_name:', nami.business_name);
console.log('portal_email:', nami.portal_email);
console.log('active:', nami.active);
console.log('meerkat_role_id (features):', nami.features?.meerkat_role_id);
console.log('jornada_type:', nami.jornada_type);
console.log('billing_status:', nami.billing_status);

console.log('\n=== NULLABLE PROMPT FIELDS ===');
for (const k of ['business_description', 'knowledge_base', 'role_knowledge_base', 'role_learnings', 'guardrails_learnings', 'first_message', 'service_definition', 'definition_of_done', 'organization_mission', 'agent_guardrails', 'tool_overrides']) {
  const v = nami[k];
  const status = v === null ? 'NULL' : v === undefined ? 'undef' : typeof v === 'string' ? `str(${v.length})` : typeof v;
  console.log(`  ${k}: ${status}`);
}

console.log('\n=== FEATURES (raw) ===');
console.log(JSON.stringify(nami.features, null, 2));

const { data: org, error: e2 } = await supabase.from('organizations').select('*').eq('portal_email', PORTAL_EMAIL).maybeSingle();
if (e2) { console.error('org err', e2); process.exit(1); }
if (!org) { console.error('NO ORG for', PORTAL_EMAIL); process.exit(1); }

console.log('\n=== ORG CORE FIELDS ===');
console.log('id:', org.id);
console.log('legal_name:', org.legal_name);
console.log('rfc:', org.rfc);
console.log('portal_email:', org.portal_email);
console.log('portal_token:', org.portal_token ? 'set' : 'null');

console.log('\n=== ORG NULLABLE FIELDS USED BY HANDLER ===');
for (const k of ['business_email', 'brand_phone', 'business_website', 'brand_website', 'business_address', 'email_footer_text', 'daily_availability', 'industry', 'business_description', 'knowledge_base', 'owner_profile', 'brand_voice_guide', 'banned_terms', 'notion_access_token', 'notion_db_id']) {
  const v = org[k];
  const status = v === null ? 'NULL' : v === undefined ? 'undef' : typeof v === 'string' ? `str(${v.length})` : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v);
  console.log(`  ${k}: ${status}`);
}

// Directory (used at 2270)
console.log('\n=== ORG.directory ===');
console.log(org.directory ? `type=${typeof org.directory}, keys=${Object.keys(org.directory || {}).join(',')}` : 'NULL');

// Ops usage
console.log('\n=== NAMI OPS USAGE ===');
console.log('ai_ops_used:', nami.ai_ops_used);
console.log('ai_ops_limit:', nami.ai_ops_limit);

// Check for column existence problems: try selecting brand_address (should fail)
const { error: badColErr } = await supabase.from('organizations').select('brand_address').limit(1);
console.log('\n=== brand_address column? ===');
console.log(badColErr ? `DROPPED (${badColErr.code}): ${badColErr.message}` : 'STILL EXISTS');
