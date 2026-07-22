import Anthropic from '@anthropic-ai/sdk';
import { getGoalsWithProgress } from '@/lib/goals/progress';

const anthropic = new Anthropic();

export interface InsightRec {
  title:          string;
  body:           string;
  metric_key?:    string;
  current_value?: number;
  priority:       'high' | 'medium' | 'low';
}

interface CesDim { score: number }
interface CesData {
  fluidez?:     CesDim;
  comprension?: CesDim;
  naturalidad?: CesDim;
  conduccion?:  CesDim;
  confianza?:   CesDim;
  resolucion?:  CesDim;
}
export interface CallRow {
  outcome:           string;
  self_eval_score?:  number | null;
  self_eval_notes?:  string | null;
  ces_data?:         CesData | null;
}

const CES_DIMS: string[] = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'];
const DIM_ES: Record<string, string> = {
  fluidez: 'Fluidez', comprension: 'Comprensión', naturalidad: 'Naturalidad',
  conduccion: 'Conducción', confianza: 'Confianza', resolucion: 'Resolución',
};

function getCesDimScore(cesData: CesData, dim: string): number | null {
  const entry = (cesData as Record<string, CesDim | undefined>)[dim];
  return entry && typeof entry.score === 'number' ? entry.score : null;
}

function cesAverages(calls: CallRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const c of calls) {
    if (!c.ces_data) continue;
    for (const d of CES_DIMS) {
      const s = getCesDimScore(c.ces_data, d);
      if (s !== null) {
        totals[d] = (totals[d] ?? 0) + s;
        counts[d] = (counts[d] ?? 0) + 1;
      }
    }
  }
  const result: Record<string, number> = {};
  for (const d of CES_DIMS) {
    if (counts[d] >= 3) result[d] = Math.round((totals[d] / counts[d]) * 10) / 10;
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
  const { agentId, agentName, agentRole, calls, prevWeekCalls } = opts;

  if (calls.length === 0) return [];

  const goals        = await getGoalsWithProgress(agentId);
  const escalated    = calls.filter(c => ['escalated_whatsapp', 'transferred'].includes(c.outcome)).length;
  const escalPct     = Math.round((escalated / calls.length) * 100);
  const resolved     = calls.filter(c => !['unanswered', 'missed', 'escalated_whatsapp', 'transferred'].includes(c.outcome)).length;
  const autoPct      = Math.round((resolved / calls.length) * 100);
  const ces          = cesAverages(calls);
  const evalScores   = calls.filter(c => c.self_eval_score).map(c => c.self_eval_score as number);
  const evalAvg      = evalScores.length >= 3
    ? (evalScores.reduce((a, b) => a + b, 0) / evalScores.length).toFixed(1)
    : null;
  const worstNotes   = calls
    .filter(c => c.self_eval_notes && c.self_eval_score && c.self_eval_score <= 3)
    .slice(0, 3)
    .map(c => c.self_eval_notes);

  const lines = [
    `Empleado: ${agentName}${agentRole ? ` (${agentRole})` : ''}`,
    `Conversaciones esta semana: ${calls.length} (semana anterior: ${prevWeekCalls.length})`,
    `Resolución autónoma: ${autoPct}%   Tasa de escalación: ${escalPct}%`,
  ];

  if (Object.keys(ces).length > 0) {
    lines.push('', 'CES promedio por dimensión (1-5):');
    for (const [k, v] of Object.entries(ces)) lines.push(`  ${DIM_ES[k]}: ${v}`);
  }

  if (evalAvg) lines.push('', `Auto-evaluación promedio: ${evalAvg}/5`);

  if (worstNotes.length > 0) {
    lines.push('', 'Notas de llamadas con bajo desempeño:');
    worstNotes.forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
  }

  if (goals.length > 0) {
    lines.push('', 'Metas del período:');
    for (const g of goals) {
      const pct = g.target > 0 ? Math.round((g.progress / g.target) * 100) : 0;
      lines.push(`  ${g.title}: ${g.progress}/${g.target} (${pct}%) — ${g.period === 'week' ? 'semanal' : 'mensual'}`);
    }
  }

  lines.push(`
Genera entre 2 y 4 recomendaciones accionables y específicas para mejorar el desempeño de este empleado.
Sé concreto: no "mejorar la comunicación" sino qué hacer exactamente.
Solo genera recomendaciones donde haya evidencia real de problema.

Responde ÚNICAMENTE con un array JSON válido (sin texto adicional):
[
  {
    "title": "<título corto, máx 60 caracteres>",
    "body": "<acción concreta en 1-2 oraciones>",
    "metric_key": "<ces_fluidez|ces_comprension|ces_naturalidad|ces_conduccion|ces_confianza|ces_resolucion|escalation_rate|auto_rate|self_eval|goal — opcional>",
    "current_value": <número opcional>,
    "priority": "<high|medium|low>"
  }
]`);

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages:   [{ role: 'user', content: lines.join('\n') }],
  });

  const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    const items = parsed as Array<Record<string, unknown>>;
    return items
      .filter(r => r.title && r.body && ['high', 'medium', 'low'].includes(r.priority as string))
      .slice(0, 4)
      .map(r => ({
        title:         r.title         as string,
        body:          r.body          as string,
        metric_key:    r.metric_key    as string | undefined,
        current_value: r.current_value as number | undefined,
        priority:      r.priority      as 'high' | 'medium' | 'low',
      }));
  } catch { return []; }
}
