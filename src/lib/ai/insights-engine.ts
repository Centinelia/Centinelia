import Anthropic from '@anthropic-ai/sdk';
import { getGoalsWithProgress } from '@/lib/goals/progress';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentActivityWindow, renderActivityBlocks, type ActivityCaps } from './activity-window';

const anthropic = new Anthropic();

export interface InsightRec {
  title:          string;
  body:           string;
  metric_key?:    string;
  current_value?: number;
  priority:       'high' | 'medium' | 'low';
}

export interface CallRow {
  outcome:           string;
  self_eval_score?:  number | null;
  self_eval_notes?:  string | null;
  ces_data?:         Record<string, unknown> | null;
}

const WEEKLY_CAPS: ActivityCaps = { calls: 30, emails: 30, docs: 30, tasks: 30, appts: 30, civic: 30 };

const CES_DIMS: string[] = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'];
const DIM_ES: Record<string, string> = {
  fluidez: 'Fluidez', comprension: 'Comprension', naturalidad: 'Naturalidad',
  conduccion: 'Conduccion', confianza: 'Confianza', resolucion: 'Resolucion',
};

function getDimScore(cesData: Record<string, unknown>, dim: string): number | null {
  const entry = cesData[dim];
  if (!entry || typeof entry !== 'object') return null;
  const score = (entry as Record<string, unknown>).score;
  return typeof score === 'number' ? score : null;
}

function cesAverages(calls: CallRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (!c.ces_data) continue;
    for (let j = 0; j < CES_DIMS.length; j++) {
      const d = CES_DIMS[j];
      const s = getDimScore(c.ces_data, d);
      if (s !== null) {
        totals[d] = (totals[d] ?? 0) + s;
        counts[d] = (counts[d] ?? 0) + 1;
      }
    }
  }
  const result: Record<string, number> = {};
  for (let i = 0; i < CES_DIMS.length; i++) {
    const d = CES_DIMS[i];
    if (counts[d] >= 3) result[d] = Math.round((totals[d] / counts[d]) * 10) / 10;
  }
  return result;
}

function buildPromptLines(
  agentName: string,
  agentRole: string,
  totalCalls: number,
  prevTotal: number,
  autoPct: number,
  escalPct: number,
  ces: Record<string, number>,
  evalAvg: string | null,
  worstNotes: string[],
  goals: Array<{ title: string; progress: number; target: number; period: string }>,
): string[] {
  const lines: string[] = [];
  const role = agentRole ? ' (' + agentRole + ')' : '';
  lines.push('Empleado: ' + agentName + role);
  lines.push('Conversaciones esta semana: ' + totalCalls + ' (semana anterior: ' + prevTotal + ')');
  lines.push('Resolucion autonoma: ' + autoPct + '%   Tasa de escalacion: ' + escalPct + '%');

  const cesKeys = Object.keys(ces);
  if (cesKeys.length > 0) {
    lines.push('');
    lines.push('CES promedio por dimension (1-5):');
    for (let i = 0; i < cesKeys.length; i++) {
      const k = cesKeys[i];
      lines.push('  ' + (DIM_ES[k] ?? k) + ': ' + ces[k]);
    }
  }

  if (evalAvg) {
    lines.push('');
    lines.push('Auto-evaluacion promedio: ' + evalAvg + '/5');
  }

  if (worstNotes.length > 0) {
    lines.push('');
    lines.push('Notas de llamadas con bajo desempeno:');
    for (let i = 0; i < worstNotes.length; i++) {
      lines.push('  ' + (i + 1) + '. ' + worstNotes[i]);
    }
  }

  if (goals.length > 0) {
    lines.push('');
    lines.push('Metas del periodo:');
    for (let i = 0; i < goals.length; i++) {
      const g = goals[i];
      const pct = g.target > 0 ? Math.round((g.progress / g.target) * 100) : 0;
      const per = g.period === 'week' ? 'semanal' : 'mensual';
      lines.push('  ' + g.title + ': ' + g.progress + '/' + g.target + ' (' + pct + '%) - ' + per);
    }
  }

  return lines;
}

function parsePriority(val: unknown): 'high' | 'medium' | 'low' | null {
  if (val === 'high') return 'high';
  if (val === 'medium') return 'medium';
  if (val === 'low') return 'low';
  return null;
}

function parseInsightRecs(raw: string): InsightRec[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(match[0]); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const result: InsightRec[] = [];
  for (let i = 0; i < parsed.length && result.length < 4; i++) {
    const item = parsed[i];
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const priority = parsePriority(r.priority);
    if (!priority) continue;
    if (typeof r.title !== 'string' || typeof r.body !== 'string') continue;
    const rec: InsightRec = { title: r.title, body: r.body, priority };
    if (typeof r.metric_key === 'string') rec.metric_key = r.metric_key;
    if (typeof r.current_value === 'number') rec.current_value = r.current_value;
    result.push(rec);
  }
  return result;
}

export async function generateLLMInsights(opts: {
  agentId:       string;
  agentName:     string;
  agentRole:     string;
  calls:         CallRow[];
  prevWeekCalls: CallRow[];
}): Promise<InsightRec[]> {
  const supabase = createAdminClient();
  const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch full activity + recent learnings in parallel
  const [activity, learningsRes] = await Promise.all([
    getAgentActivityWindow(opts.agentId, weekAgoISO, WEEKLY_CAPS, { includeCivic: false }),
    supabase.from('agent_learnings')
      .select('content, source, confidence, status, created_at')
      .eq('agent_id', opts.agentId)
      .gte('created_at', weekAgoISO)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const learningsList = learningsRes.data ?? [];

  // Only skip if there is truly no data across all sources
  const totalActivity = opts.calls.length
    + activity.emails.length + activity.docs.length
    + activity.tasks.length + activity.appts.length + activity.civic.length;
  if (totalActivity === 0 && learningsList.length === 0) return [];

  const goals     = await getGoalsWithProgress(opts.agentId);
  const escalated = opts.calls.filter(c => c.outcome === 'escalated_whatsapp' || c.outcome === 'transferred').length;
  const escalPct  = opts.calls.length > 0 ? Math.round((escalated / opts.calls.length) * 100) : 0;
  const resolved  = opts.calls.filter(c => c.outcome !== 'unanswered' && c.outcome !== 'missed' && c.outcome !== 'escalated_whatsapp' && c.outcome !== 'transferred').length;
  const autoPct   = opts.calls.length > 0 ? Math.round((resolved / opts.calls.length) * 100) : 0;
  const ces       = cesAverages(opts.calls);

  const evalScores: number[] = [];
  for (let i = 0; i < opts.calls.length; i++) {
    const s = opts.calls[i].self_eval_score;
    if (typeof s === 'number') evalScores.push(s);
  }
  const evalAvg = evalScores.length >= 3
    ? String((evalScores.reduce((a, b) => a + b, 0) / evalScores.length).toFixed(1))
    : null;

  const worstNotes: string[] = [];
  for (let i = 0; i < opts.calls.length && worstNotes.length < 3; i++) {
    const c = opts.calls[i];
    if (c.self_eval_notes && typeof c.self_eval_score === 'number' && c.self_eval_score <= 3) {
      worstNotes.push(c.self_eval_notes);
    }
  }

  // SECTION 1: call metrics (existing)
  const lines = buildPromptLines(
    opts.agentName, opts.agentRole,
    opts.calls.length, opts.prevWeekCalls.length,
    autoPct, escalPct, ces, evalAvg, worstNotes, goals,
  );

  // SECTION 2: full activity window from all sources
  const activityBlocks = renderActivityBlocks(activity, 'America/Monterrey');
  lines.push('');
  lines.push('ACTIVIDAD COMPLETA DE LA SEMANA (todas las fuentes):');
  lines.push(activityBlocks);

  // SECTION 3: recent agent learnings
  const learningsBlock = learningsList.length
    ? `APRENDIZAJES RECIENTES DEL EMPLEADO (${learningsList.length}):\n${learningsList.map(l => `- [fuente: ${l.source ?? '?'}, confianza: ${l.confidence ?? '?'}, estado: ${l.status ?? '?'}]: ${l.content}`).join('\n')}`
    : '';
  if (learningsBlock) {
    lines.push('');
    lines.push(learningsBlock);
  }

  // Final instruction considers all sources
  lines.push('');
  lines.push('Genera entre 2 y 4 recomendaciones accionables considerando toda la actividad (no solo llamadas). Prioriza impacto en negocio: leads, citas, ventas, retencion. Cada recomendacion debe referenciar datos concretos.');
  lines.push('Responde SOLO con un array JSON valido:');
  lines.push('[{"title":"...","body":"...","metric_key":"...","current_value":0,"priority":"high|medium|low"}]');

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages:   [{ role: 'user', content: lines.join('\n') }],
  });

  const first = response.content[0];
  const raw   = first.type === 'text' ? first.text.trim() : '';
  return parseInsightRecs(raw);
}
