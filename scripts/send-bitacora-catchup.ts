/**
 * Envío manual de la bitácora semanal cuando el cron Vercel skipeó el slot
 * (miss-rate observado ~25% en crons hourly, ver commit b4b67730).
 *
 * Uso:
 *   AGENT_ID=<uuid> WEEK_MONDAY=YYYY-MM-DD pnpm tsx scripts/send-bitacora-catchup.ts
 *
 * WEEK_MONDAY es el LUNES de la semana a re-mandar (00:00 MX).
 * Simula que estamos en el sábado de esa semana (14:00 MX) para replicar el
 * flow del cron 1:1.
 *
 * Idempotencia: revisa `bitacora_weekly_deliveries` antes; aborta si ya
 * existe row para (agent_id, week_monday). Post-éxito inserta row.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') });
dotenvConfig(); // fallback to .env

import { createClient } from '@supabase/supabase-js';
import { runPersistentFlow, runEphemeralFlow, type BitacoraConfig, type TemplateConfig } from '@/lib/bitacora/weekly-flow';

interface AgentRow {
  id:                     string;
  agent_name:             string | null;
  business_name:          string | null;
  portal_email:           string | null;
  email_from:             string | null;
  email_domain_verified:  boolean | null;
  bitacora_weekly_config: BitacoraConfig | null;
  bitacora_template:      TemplateConfig | null;
  active:                 boolean;
}

async function main() {
  const AGENT_ID    = process.env.AGENT_ID;
  const WEEK_MONDAY = process.env.WEEK_MONDAY;
  if (!AGENT_ID || !WEEK_MONDAY) {
    console.error('Faltan env vars: AGENT_ID=<uuid> WEEK_MONDAY=YYYY-MM-DD');
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(WEEK_MONDAY)) {
    console.error('WEEK_MONDAY debe ser YYYY-MM-DD');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: agentData, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, email_from, email_domain_verified, bitacora_weekly_config, bitacora_template, active')
    .eq('id', AGENT_ID)
    .maybeSingle();

  if (agentErr || !agentData) {
    console.error('Agent no encontrado:', agentErr?.message);
    process.exit(1);
  }
  const agent = agentData as unknown as AgentRow;
  if (!agent.active) {
    console.error('Agent inactivo, abortando');
    process.exit(1);
  }

  const cfg = agent.bitacora_weekly_config;
  if (!cfg?.enabled) {
    console.error('bitacora_weekly_config no está enabled para este agent');
    process.exit(1);
  }
  if (!cfg.recipients?.length) {
    console.error('recipients vacío');
    process.exit(1);
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('incidencia_flow_enabled')
    .eq('portal_email', agent.portal_email as string)
    .maybeSingle();
  if (!org?.incidencia_flow_enabled) {
    console.error('org.incidencia_flow_enabled=false, abortando');
    process.exit(1);
  }

  const { data: prior } = await supabase
    .from('bitacora_weekly_deliveries')
    .select('id, sent_at, recipients')
    .eq('agent_id', AGENT_ID)
    .eq('week_start', WEEK_MONDAY)
    .maybeSingle();
  if (prior) {
    console.error(`Ya hay delivery para semana ${WEEK_MONDAY}: ${prior.sent_at} → ${JSON.stringify(prior.recipients)}. Abortando.`);
    process.exit(1);
  }

  // Simular currentDate = sábado 14:00 MX de esa semana (lunes + 5 días)
  const monday = new Date(`${WEEK_MONDAY}T00:00:00-06:00`);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  saturday.setHours(14, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  console.log(`Enviando bitácora catchup:`);
  console.log(`  agent:      ${agent.agent_name} (${agent.business_name})`);
  console.log(`  agent_id:   ${AGENT_ID}`);
  console.log(`  semana:     ${WEEK_MONDAY} → ${new Date(monday.getTime() + 6*86400000).toISOString().slice(0,10)}`);
  console.log(`  recipients: ${JSON.stringify(cfg.recipients)}`);

  const template = agent.bitacora_template;
  const usePersistent = !!(template?.url && template.mapping);
  console.log(`  mode:       ${usePersistent ? 'persistent' : 'ephemeral'}`);

  const agentForFlow = agent as unknown as Record<string, unknown>;
  const result = usePersistent
    ? await runPersistentFlow(supabase, agentForFlow, cfg, template, saturday)
    : await runEphemeralFlow(supabase, agentForFlow, cfg, monday, nextMonday, saturday);

  if (!result.ok) {
    console.error('El envío falló (result.ok=false). No se inserta row en deliveries.');
    process.exit(1);
  }

  const { error: insErr } = await supabase.from('bitacora_weekly_deliveries').insert({
    agent_id:         AGENT_ID,
    week_start:       WEEK_MONDAY,
    recipients:       cfg.recipients,
    included_monthly: result.isMonthlyFinal,
  });
  if (insErr) {
    console.error('Envío OK pero insert en deliveries falló:', insErr.message);
    process.exit(1);
  }

  console.log(`OK. isMonthlyFinal=${result.isMonthlyFinal}. Delivery registrado.`);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
