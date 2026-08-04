/**
 * H4 — Replay harness para regresión de tools.
 *
 * Toma las últimas N invocaciones reales de tool_call_log para un tool
 * (opcionalmente filtrado por agent_id) y las re-ejecuta contra la
 * implementación actual. Diff de output → detecta regresiones antes de
 * flippear meerkat_active_versions.
 *
 * Uso:
 *   npx tsx scripts/replay-tool-traces.ts --tool=buscar_en_web --limit=20
 *   npx tsx scripts/replay-tool-traces.ts --agent=<uuid> --tool=send_email --dry
 *
 * Flags:
 *   --tool=<name>       (requerido) nombre exacto del tool
 *   --limit=<n>         cuántas invocaciones (default 10, max 200)
 *   --agent=<uuid>      solo trazas de este agente
 *   --channel=<name>    solo trazas de este canal
 *   --dry               NO ejecutar tools destructivas (send_email, llamada, factura)
 *
 * Este script NO reintenta con verify — solo compara raw output shapes.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { executeAgentTool } from '../src/lib/tools/executor';

const DESTRUCTIVE = new Set([
  'send_email', 'trigger_outbound_call', 'solicitar_factura',
  'qb_crear_factura', 'create_contract_draft', 'delete_calendar_event',
]);

interface Args {
  tool:    string;
  limit:   number;
  agent?:  string;
  channel?: string;
  dry:     boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get  = (k: string) => argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
  const has  = (k: string) => argv.includes(`--${k}`);
  const tool = get('tool');
  if (!tool) {
    console.error('Falta --tool=<name>. Ej: --tool=buscar_en_web');
    process.exit(1);
  }
  return {
    tool,
    limit:   Math.min(Math.max(Number(get('limit')) || 10, 1), 200),
    agent:   get('agent'),
    channel: get('channel'),
    dry:     has('dry'),
  };
}

async function main() {
  const args = parseArgs();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (DESTRUCTIVE.has(args.tool) && !args.dry) {
    console.error(`Tool "${args.tool}" es destructiva. Añade --dry o cambia de tool.`);
    process.exit(1);
  }

  let q = supabase.from('tool_call_log')
    .select('id, agent_id, portal_email, channel, tool_name, input_json, output_json, ok, latency_ms, created_at')
    .eq('tool_name', args.tool)
    .order('created_at', { ascending: false })
    .limit(args.limit);
  if (args.agent)   q = q.eq('agent_id', args.agent);
  if (args.channel) q = q.eq('channel', args.channel);

  const { data: traces, error } = await q;
  if (error) { console.error(error); process.exit(1); }
  if (!traces?.length) { console.error('Sin trazas para replay.'); process.exit(0); }

  console.log(`\n▶ Replay de ${traces.length} invocaciones de "${args.tool}"${args.dry ? ' [DRY]' : ''}\n`);

  let matches = 0;
  let diffs   = 0;
  let errors  = 0;

  for (const t of traces) {
    if (!t.agent_id || !t.portal_email) {
      console.log(`  ↳ ${t.id.slice(0,8)}  skip: sin agent_id/portal_email`);
      continue;
    }
    // Hidratar contexto mínimo del agente para el executor.
    const { data: agent } = await supabase
      .from('voice_agents').select('*').eq('id', t.agent_id).single();
    if (!agent) { console.log(`  ↳ ${t.id.slice(0,8)}  skip: agente borrado`); continue; }

    const started = Date.now();
    let newOutput: unknown;
    let newErr: unknown;
    try {
      newOutput = await executeAgentTool(args.tool, (t.input_json ?? {}) as Record<string, unknown>, {
        agentId:      t.agent_id,
        portalEmail:  t.portal_email,
        agentName:    (agent.agent_name as string | null) ?? '',
        businessName: (agent.business_name as string | null) ?? '',
        portalToken:  (agent.portal_token as string | null) ?? '',
        agent:        agent as Record<string, unknown>,
        supabase:     supabase as any,
        channel:      'cron',
      });
    } catch (err) { newErr = err; }

    const newLatency = Date.now() - started;
    const oldOk      = t.ok;
    const newOk      = !newErr && !isFail(newOutput);
    const sameOk     = oldOk === newOk;
    const sameShape  = shapeEq(t.output_json, newOutput);

    if (newErr) { errors++; console.log(`  ✗ ${t.id.slice(0,8)}  ERROR: ${String(newErr).slice(0,80)}`); continue; }
    if (sameOk && sameShape) { matches++; console.log(`  ✓ ${t.id.slice(0,8)}  match  (old ${t.latency_ms}ms → new ${newLatency}ms)`); continue; }

    diffs++;
    console.log(`  ~ ${t.id.slice(0,8)}  DIFF  ok:${oldOk}→${newOk}  latency:${t.latency_ms}ms→${newLatency}ms`);
    if (!sameShape) {
      console.log(`      old: ${preview(t.output_json)}`);
      console.log(`      new: ${preview(newOutput)}`);
    }
  }

  console.log(`\nResumen: ${matches} match · ${diffs} diff · ${errors} error\n`);
  process.exit(diffs > 0 || errors > 0 ? 1 : 0);
}

function isFail(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as { ok?: unknown }).ok === false;
}
function shapeEq(a: unknown, b: unknown): boolean {
  const ka = keyShape(a);
  const kb = keyShape(b);
  return ka === kb;
}
function keyShape(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v !== 'object') return typeof v;
  if (Array.isArray(v)) return `array[${v.length ? keyShape(v[0]) : ''}]`;
  return '{' + Object.keys(v as object).sort().join(',') + '}';
}
function preview(v: unknown): string {
  try { return JSON.stringify(v).slice(0, 180); } catch { return String(v).slice(0, 180); }
}

main().catch(e => { console.error(e); process.exit(1); });
