import { getGoalsWithProgress } from '@/lib/goals/progress';
import type { CallRow, InsightRec } from './insights-engine';
// Nota: deep_link se agrega al insertar en DB, no aquí (necesita token del portal).

const CES_DIMS: string[] = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'];
const DIM_ES: Record<string, string> = {
  fluidez: 'Fluidez', comprension: 'Comprension', naturalidad: 'Naturalidad',
  conduccion: 'Conduccion', confianza: 'Confianza', resolucion: 'Resolucion',
};
const DIM_ADVICE: Record<string, string> = {
  fluidez:    'Revisa el endpointing del agente o si tiene pausas largas en el prompt.',
  comprension:'Amplia los ejemplos en la base de conocimiento con variaciones de como preguntan los clientes.',
  naturalidad:'Enriquece el perfil de personalidad del empleado con mas variaciones de lenguaje.',
  conduccion: 'Refuerza la Definicion de Exito con instrucciones claras de como guiar la conversacion.',
  confianza:  'Actualiza el manual con los casos donde el empleado debe escalar.',
  resolucion: 'Verifica que el empleado tenga todas las herramientas para resolver el caso principal.',
};

function getDimScore(cesData: Record<string, unknown>, dim: string): number | null {
  const entry = cesData[dim];
  if (!entry || typeof entry !== 'object') return null;
  const score = (entry as Record<string, unknown>).score;
  return typeof score === 'number' ? score : null;
}

function cesAvg(calls: CallRow[], dim: string): number | null {
  const scores: number[] = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (!c.ces_data) continue;
    const s = getDimScore(c.ces_data, dim);
    if (s !== null) scores.push(s);
  }
  if (scores.length < 3) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export async function generateRulesInsights(opts: {
  agentId:       string;
  agentName:     string;
  calls:         CallRow[];
  prevWeekCalls: CallRow[];
}): Promise<InsightRec[]> {
  const recs: InsightRec[] = [];

  if (opts.calls.length === 0) {
    if (opts.prevWeekCalls.length > 0) {
      recs.push({
        title:    opts.agentName + ' no tuvo actividad esta semana',
        body:     'La semana anterior registro ' + opts.prevWeekCalls.length + ' conversaciones. Verifica que el numero este activo y el agente habilitado.',
        priority: 'high',
      });
    }
    return recs;
  }

  const escalated = opts.calls.filter(c => c.outcome === 'escalated_whatsapp' || c.outcome === 'transferred').length;
  const escalPct  = Math.round((escalated / opts.calls.length) * 100);
  if (escalPct > 30) {
    const p: 'high' | 'medium' = escalPct > 50 ? 'high' : 'medium';
    recs.push({
      title:         'Tasa de escalacion alta: ' + escalPct + '%',
      body:          'Mas de 3 de cada 10 conversaciones se escalan. Identifica los temas frecuentes y agregatlos a la base de conocimiento.',
      metric_key:    'escalation_rate',
      current_value: escalPct,
      priority:      p,
    });
  }

  for (let i = 0; i < CES_DIMS.length; i++) {
    const dim = CES_DIMS[i];
    const avg = cesAvg(opts.calls, dim);
    if (avg !== null && avg < 3.5) {
      const p: 'high' | 'medium' = avg < 2.5 ? 'high' : 'medium';
      recs.push({
        title:         'CES ' + (DIM_ES[dim] ?? dim) + ' bajo: ' + avg.toFixed(1) + '/5',
        body:          DIM_ADVICE[dim] ?? '',
        metric_key:    'ces_' + dim,
        current_value: Math.round(avg * 10) / 10,
        priority:      p,
      });
    }
  }

  const evalScores: number[] = [];
  for (let i = 0; i < opts.calls.length; i++) {
    const s = opts.calls[i].self_eval_score;
    if (typeof s === 'number') evalScores.push(s);
  }
  if (evalScores.length >= 3) {
    const avg = evalScores.reduce((a, b) => a + b, 0) / evalScores.length;
    if (avg < 3.5) {
      recs.push({
        title:         'Auto-evaluacion baja: ' + avg.toFixed(1) + '/5',
        body:          'Revisa las llamadas con puntuacion 1-2 y ajusta la Definicion de Exito del empleado.',
        metric_key:    'self_eval',
        current_value: Math.round(avg * 10) / 10,
        priority:      'high',
      });
    }
  }

  if (opts.prevWeekCalls.length > 0) {
    const drop = Math.round(((opts.prevWeekCalls.length - opts.calls.length) / opts.prevWeekCalls.length) * 100);
    if (drop > 30) {
      recs.push({
        title:    'Caida del ' + drop + '% en conversaciones',
        body:     'Esta semana: ' + opts.calls.length + '. Semana anterior: ' + opts.prevWeekCalls.length + '. Verifica disponibilidad del agente y estado del numero.',
        priority: 'medium',
      });
    }
  }

  const goals = await getGoalsWithProgress(opts.agentId);
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    if (g.target <= 0 || g.period !== 'week') continue;
    const pct = g.progress / g.target;
    if (pct < 0.5) {
      const p: 'high' | 'medium' = pct < 0.25 ? 'high' : 'medium';
      recs.push({
        title:         'Meta "' + g.title + '" al ' + Math.round(pct * 100) + '%',
        body:          'Lleva ' + g.progress + ' de ' + g.target + ' esta semana. Prioriza este objetivo en las proximas interacciones.',
        metric_key:    'goal',
        current_value: Math.round(pct * 100),
        priority:      p,
      });
    }
  }

  return recs.slice(0, 5);
}
