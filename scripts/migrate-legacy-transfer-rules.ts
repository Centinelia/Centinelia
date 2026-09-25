/**
 * Script de migración: transfiere datos legacy de voice_agents.transfer_rules
 * a agent_rules con clasificación Sonnet.
 *
 * Uso:
 *   pnpm tsx scripts/migrate-legacy-transfer-rules.ts [--dry-run]
 *
 * Variables de entorno opcionales:
 *   TEST_ONLY_PORTAL_EMAIL=xxx@yyy.com   procesa solo un org
 *
 * Idempotente: skip si ya existe una regla con el mismo texto para el mismo
 * (portal_email, meerkat_role_id).
 *
 * NO ejecutar en producción sin dry-run previo.
 * El controller (Nazre) decide cuándo correr con datos reales.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { logLlmCall } from '@/lib/observability/llm-log';

// ─── Config ─────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const TEST_ONLY_PORTAL_EMAIL = process.env.TEST_ONLY_PORTAL_EMAIL ?? null;
const MIGRATION_SOURCE = 'migration_2026-09-25';
const SONNET_MODEL = 'claude-sonnet-4-6-20251001';

// ─── Supabase / Anthropic setup ──────────────────────────────────────────────

function buildSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos');
  return createClient(url, key);
}

function buildAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY es requerido');
  return new Anthropic({ apiKey: key });
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface AgentRow {
  id: string;
  portal_email: string | null;
  transfer_rules: string;
  features: Record<string, unknown> | null;
}

export interface ClassificationResult {
  classification: 'clara' | 'ambigua';
  reason: string;
}

export interface MigrationResult {
  agentId: string;
  portalEmail: string | null;
  meerkatRoleId: string | null;
  status: 'migrated' | 'skipped_no_role' | 'skipped_duplicate' | 'dry_run';
  classification?: 'clara' | 'ambigua';
  ruleId?: string;
}

// ─── Clasificación con Sonnet ─────────────────────────────────────────────────

export async function classifyTransferRules(
  client: Anthropic,
  text: string,
  agentId: string,
  portalEmail: string | null,
): Promise<ClassificationResult> {
  const __t = Date.now();

  const message = await client.messages.create({
    model:      SONNET_MODEL,
    max_tokens: 200,
    messages:   [
      {
        role:    'user',
        content: `Clasifica el siguiente texto como 'clara' (imperativo, condicional específico, instrucción accionable) o 'ambigua' (texto suelto, notas informales, fragmentos incompletos).

Texto:
"""
${text}
"""

Responde SOLO con JSON válido en este formato exacto:
{"classification": "clara" | "ambigua", "reason": "explicación breve de máximo 20 palabras"}`,
      },
    ],
  });

  // logLlmCall obligatorio (enforced por pnpm lint)
  logLlmCall({
    source:      'migrate_transfer_rules',
    model:       SONNET_MODEL,
    usage:       message.usage,
    agentId:     agentId,
    portalEmail: portalEmail,
    latencyMs:   Date.now() - __t,
    meta:        { script: 'migrate-legacy-transfer-rules' },
  }).catch(err => console.error('[migrate] logLlmCall failed:', err));

  const raw = message.content[0];
  if (raw.type !== 'text') throw new Error('Respuesta inesperada de Sonnet: no es texto');

  let parsed: ClassificationResult;
  try {
    parsed = JSON.parse(raw.text.trim()) as ClassificationResult;
  } catch {
    throw new Error(`JSON inválido de Sonnet: ${raw.text.slice(0, 200)}`);
  }

  if (parsed.classification !== 'clara' && parsed.classification !== 'ambigua') {
    throw new Error(`classification inválido: ${parsed.classification}`);
  }

  return parsed;
}

// ─── Idempotencia ─────────────────────────────────────────────────────────────

export async function isDuplicate(
  supabase: ReturnType<typeof buildSupabaseClient>,
  portalEmail: string,
  meerkatRoleId: string,
  regla: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('agent_rules')
    .select('id')
    .eq('portal_email', portalEmail)
    .eq('regla', regla)
    .contains('applies_to', [meerkatRoleId])
    .maybeSingle();

  if (error) throw new Error(`isDuplicate query error: ${error.message}`);
  return data !== null;
}

// ─── Migrar un agente ─────────────────────────────────────────────────────────

export async function migrateAgent(
  supabase: ReturnType<typeof buildSupabaseClient>,
  anthropic: Anthropic,
  agent: AgentRow,
  dryRun: boolean,
): Promise<MigrationResult> {
  // Guard defensivo: portal_email nulo causaría FK violation silenciosa en agent_rules.
  if (!agent.portal_email) {
    console.warn(`[migration] Skipping agent ${agent.id}: null portal_email`);
    return { agentId: agent.id, portalEmail: null, meerkatRoleId: null, status: 'skipped_no_role' };
  }

  const meerkatRoleId = (agent.features?.meerkat_role_id as string | undefined) ?? null;

  if (!meerkatRoleId) {
    console.warn(`[skip] agent ${agent.id} (${agent.portal_email}) sin meerkat_role_id`);
    return { agentId: agent.id, portalEmail: agent.portal_email, meerkatRoleId: null, status: 'skipped_no_role' };
  }

  const portalEmail = agent.portal_email;
  const regla = agent.transfer_rules.trim();

  // Verificar idempotencia (si ya existe, skip)
  const alreadyExists = await isDuplicate(supabase, portalEmail, meerkatRoleId, regla);
  if (alreadyExists) {
    console.log(`[skip-dup] agent ${agent.id} regla ya existe en agent_rules`);
    return { agentId: agent.id, portalEmail: agent.portal_email, meerkatRoleId, status: 'skipped_duplicate' };
  }

  // Clasificar con Sonnet
  const classification = await classifyTransferRules(anthropic, regla, agent.id, agent.portal_email);
  console.log(`[classify] agent ${agent.id} → ${classification.classification} (${classification.reason})`);

  if (dryRun) {
    console.log(`[dry-run] agent ${agent.id} habria insertado: active=${classification.classification === 'clara'}, regla="${regla.slice(0, 80)}..."`);
    return { agentId: agent.id, portalEmail: agent.portal_email, meerkatRoleId, status: 'dry_run', classification: classification.classification };
  }

  // Preparar el row a insertar
  const isClara = classification.classification === 'clara';
  const insertRow = {
    portal_email: portalEmail,
    regla,
    detalles:     isClara
      ? null
      : 'Regla migrada de la sección Reglas de transferencia anterior. Revisa y activa si sigue aplicando.',
    applies_to:   [meerkatRoleId],
    active:       isClara,
    created_by:   MIGRATION_SOURCE,
  };

  const { data, error } = await supabase
    .from('agent_rules')
    .insert(insertRow)
    .select('id')
    .single();

  if (error) throw new Error(`Insert agent_rules error: ${error.message}`);

  console.log(`[migrated] agent ${agent.id} → rule ${(data as { id: string }).id} (active=${isClara})`);
  return {
    agentId:        agent.id,
    portalEmail:    agent.portal_email,
    meerkatRoleId,
    status:         'migrated',
    classification: classification.classification,
    ruleId:         (data as { id: string }).id,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runMigration(opts?: {
  supabase?: ReturnType<typeof buildSupabaseClient>;
  anthropic?: Anthropic;
  dryRun?: boolean;
  testOnlyPortalEmail?: string | null;
}): Promise<MigrationResult[]> {
  const supabase  = opts?.supabase  ?? buildSupabaseClient();
  const anthropic = opts?.anthropic ?? buildAnthropicClient();
  const dryRun    = opts?.dryRun    ?? DRY_RUN;
  const filterEmail = opts?.testOnlyPortalEmail !== undefined
    ? opts.testOnlyPortalEmail
    : TEST_ONLY_PORTAL_EMAIL;

  console.log(`[migrate-legacy-transfer-rules] modo=${dryRun ? 'DRY-RUN' : 'REAL'}${filterEmail ? ` filtro=${filterEmail}` : ''}`);

  // Query agents con transfer_rules no nulos. El filtro real de longitud
  // se aplica en JS para evitar la comparación lexicográfica engañosa (.gt).
  let query = supabase
    .from('voice_agents')
    .select('id, portal_email, transfer_rules, features')
    .not('transfer_rules', 'is', null);

  if (filterEmail) {
    query = query.eq('portal_email', filterEmail);
  }

  const { data: agents, error } = await query;
  if (error) throw new Error(`Query voice_agents error: ${error.message}`);

  const rows = (agents ?? []) as AgentRow[];
  // Filtrar en código: trimmed length > 5 (descarta strings en blanco o muy cortos)
  const eligibleRows = rows.filter(a => a.transfer_rules?.trim().length > 5);

  console.log(`[migrate-legacy-transfer-rules] agentes elegibles: ${eligibleRows.length}`);

  const results: MigrationResult[] = [];
  for (const agent of eligibleRows) {
    try {
      const result = await migrateAgent(supabase, anthropic, agent, dryRun);
      results.push(result);
    } catch (err) {
      console.error(`[error] agent ${agent.id}:`, err);
      // No lanzar — continuar con el siguiente agente
    }
  }

  // Resumen final
  const counts = {
    migrated:         results.filter(r => r.status === 'migrated').length,
    dry_run:          results.filter(r => r.status === 'dry_run').length,
    skipped_no_role:  results.filter(r => r.status === 'skipped_no_role').length,
    skipped_duplicate: results.filter(r => r.status === 'skipped_duplicate').length,
  };
  console.log('[migrate-legacy-transfer-rules] resumen:', counts);

  return results;
}

// ─── Entrypoint CLI ───────────────────────────────────────────────────────────

if (require.main === module) {
  runMigration()
    .then(results => {
      const migrated = results.filter(r => r.status === 'migrated' || r.status === 'dry_run').length;
      const skipped  = results.filter(r => r.status === 'skipped_no_role' || r.status === 'skipped_duplicate').length;
      console.log(`\nCompletado: ${migrated} procesados, ${skipped} skipped`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[migrate-legacy-transfer-rules] fatal:', err);
      process.exit(1);
    });
}
