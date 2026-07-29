#!/usr/bin/env tsx
/**
 * Descarga las últimas N llamadas reales de voice_calls y las formatea como
 * cases en scripts/eval/cases/. Útil para poblar F11 después de una batch
 * de llamadas de prueba (o cuando ya tengamos volumen real).
 *
 * Uso:
 *   npx tsx scripts/eval/pull-real-cases.ts --limit=10
 *   npx tsx scripts/eval/pull-real-cases.ts --limit=7 --min-duration=15
 *   npx tsx scripts/eval/pull-real-cases.ts --agent=<id> --limit=5
 *   npx tsx scripts/eval/pull-real-cases.ts --portal=<email>
 *
 * Filtros por default:
 *   - transcript IS NOT NULL
 *   - duration_seconds >= 15 (evita llamadas que colgaron sin hablar)
 *   - outcome != 'unanswered'
 *
 * Los cases se guardan como scripts/eval/cases/real-<yyyymmdd-hhmm>-<n>.json
 * con el schema del harness. NO sobreescribe cases existentes.
 *
 * Carga .env.local automáticamente vía @next/env.
 */
import '../_bootstrap';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.+)$/);
  if (m) args.set(m[1], m[2]);
}

const limit       = parseInt(args.get('limit') ?? '10', 10);
const minDuration = parseInt(args.get('min-duration') ?? '15', 10);
const agent       = args.get('agent');
const portal      = args.get('portal');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.');
  console.error('Corre con: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/eval/pull-real-cases.ts');
  console.error('O más fácil: exporta las de .env.local antes de correr.');
  process.exit(1);
}

const supabase = createClient(url, key);

interface CallRow {
  id:                string;
  agent_id:          string;
  created_at:        string;
  outcome:           string | null;
  duration_seconds:  number | null;
  transcript:        string | null;
  summary:           string | null;
  ces_data:          Record<string, { score: number; obs: string }> | null;
  self_eval_score:   number | null;
  self_eval_notes:   string | null;
}

interface AgentInfo {
  id:               string;
  business_name:    string;
  agent_name:       string | null;
  role:             string | null;
  portal_email:     string | null;
  features:         Record<string, unknown> | null;
}

async function main() {
  console.log(`Descargando últimas ${limit} llamadas con transcript…`);

  let q = supabase
    .from('voice_calls')
    .select('id, agent_id, created_at, outcome, duration_seconds, transcript, summary, ces_data, self_eval_score, self_eval_notes')
    .not('transcript', 'is', null)
    .gte('duration_seconds', minDuration)
    .neq('outcome', 'unanswered')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (agent)  q = q.eq('agent_id', agent);

  const { data: calls, error } = await q;
  if (error) { console.error('Error Supabase:', error); process.exit(1); }
  if (!calls?.length) {
    console.error('Sin llamadas que cumplan los filtros.');
    process.exit(0);
  }

  const agentIds = [...new Set(calls.map((c: CallRow) => c.agent_id))];
  let agentsQ = supabase.from('voice_agents')
    .select('id, business_name, agent_name, role, portal_email, features')
    .in('id', agentIds);
  if (portal) agentsQ = agentsQ.eq('portal_email', portal);
  const { data: agentsData } = await agentsQ;
  const agentMap = new Map<string, AgentInfo>((agentsData ?? []).map((a: AgentInfo) => [a.id, a]));

  const casesDir = join(process.cwd(), 'scripts', 'eval', 'cases');
  if (!existsSync(casesDir)) mkdirSync(casesDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');

  let written = 0;
  for (let i = 0; i < calls.length; i++) {
    const c: CallRow = calls[i] as CallRow;
    const a = agentMap.get(c.agent_id);
    if (portal && (!a || a.portal_email !== portal)) continue;

    const meerkatRoleId = (a?.features?.meerkat_role_id as string | undefined) ?? null;
    const durationMin   = Math.round((c.duration_seconds ?? 0) / 6) / 10;   // 1 decimal

    const turns = parseTranscript(c.transcript ?? '');

    const caseObj = {
      id:              `real-${stamp}-${String(i + 1).padStart(2, '0')}`,
      description:     `Llamada real ${c.id} — outcome: ${c.outcome} · ${durationMin}min · ${a?.business_name ?? 'agente'}${a?.agent_name ? ` (${a.agent_name})` : ''}`,
      meerkat_role_id: meerkatRoleId,
      business_context: [
        `Negocio: ${a?.business_name ?? '—'}`,
        `Rol: ${a?.role ?? '—'}`,
        `Agente: ${a?.agent_name ?? '—'}`,
      ].filter(Boolean).join(' · '),
      transcript_input: turns,
      ground_truth: {
        outcome:         c.outcome,
        duration_seconds: c.duration_seconds,
        summary:         c.summary,
        ces_data:        c.ces_data,
        self_eval_score: c.self_eval_score,
        self_eval_notes: c.self_eval_notes,
      },
      expected: {
        // Placeholders — Nazre puede rellenar manualmente después basándose
        // en lo que la llamada real hizo bien / mal.
        ces_min:            null,
        should_not_contain: [],
        should_contain_any: [],
      },
    };

    const outPath = join(casesDir, `${caseObj.id}.json`);
    if (existsSync(outPath)) {
      console.log(`- ${caseObj.id}.json ya existe, skip`);
      continue;
    }
    writeFileSync(outPath, JSON.stringify(caseObj, null, 2) + '\n');
    console.log(`✓ ${caseObj.id}.json — ${a?.business_name ?? '—'} · ${c.outcome} · ${durationMin}min · ${turns.length} turnos`);
    written++;
  }

  console.log(`\n${written} cases nuevos escritos en scripts/eval/cases/`);
  if (written > 0) {
    console.log('\nSiguientes pasos:');
    console.log('  1. Abre cada case en scripts/eval/cases/ y llena el bloque `expected` con criterios reales:');
    console.log('     - ces_min: qué CES mínimo por dimensión debería tener');
    console.log('     - should_not_contain: frases robóticas a evitar');
    console.log('     - should_contain_any: ideas que la respuesta debería cubrir');
    console.log('  2. Los ground_truth (outcome, ces_data real, etc.) ya vienen adjuntados para referencia.');
    console.log('  3. Corre: npx tsx scripts/eval/run-cases.ts');
  }
}

/**
 * Parser rough del transcript de Vapi (formato "AI: … \n User: …" o similar).
 * Si no matchea el formato, deja el transcript entero como un solo turno user.
 */
function parseTranscript(raw: string): Array<{ role: 'assistant' | 'user'; text: string }> {
  const lines = raw.split(/\n+/).filter(l => l.trim());
  const turns: Array<{ role: 'assistant' | 'user'; text: string }> = [];
  for (const line of lines) {
    const m = line.match(/^\s*(AI|Assistant|Bot|Agente|User|Usuario|Caller|Cliente)\s*:\s*(.+)$/i);
    if (m) {
      const roleTag = m[1].toLowerCase();
      const isAssistant = /^(ai|assistant|bot|agente)$/i.test(roleTag);
      turns.push({ role: isAssistant ? 'assistant' : 'user', text: m[2].trim() });
    } else if (turns.length > 0) {
      // Continúa el turno anterior
      turns[turns.length - 1].text += ' ' + line.trim();
    } else {
      // Sin formato reconocible — todo va como un solo user turn
      turns.push({ role: 'user', text: raw.trim() });
      break;
    }
  }
  return turns;
}

main().catch(err => { console.error(err); process.exit(1); });
