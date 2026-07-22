import { getGoalsWithProgress } from '@/lib/goals/progress';
import type { CallRow, InsightRec } from './insights-engine';

const CES_DIMS = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'] as const;
const DIM_ES: Record<string, string> = {
  fluidez: 'Fluidez', comprension: 'Comprensión', naturalidad: 'Naturalidad',
  conduccion: 'Conducción', confianza: 'Confianza', resolucion: 'Resolución',
};
const DIM_ADVICE: Record<string, string> = {
  fluidez:    'Revisa el endpointing del agente o si tiene pausas largas en el prompt.',
  comprension:'Amplía los ejemplos en la base de conocimiento con variaciones de cómo los clientes preguntan.',
  naturalidad:'Enriquece el perfil de personalidad del empleado con más variaciones de lenguaje.',
  conduccion: 'Refuerza la Definición de Éxito con instrucciones claras de cómo guiar la conversación.',
  confianza:  'Actualiza el manual con los casos específicos donde el empleado debe escalar.',
  resolucion: 'Verifica que el empleado tenga todas las herramientas y datos necesarios para resolver el caso principal.',
};

function cesAvg(calls: CallRow[], dim: string): number | null {
  const scores = calls
    .filter(c => c.ces_data && (c.ces_data as Record<string, { score: number }>)[dim]?.score)
    .map(c => (c.ces_data as Record<string, { score: number }>)[dim].score);
  if (scores.length < 3) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export async function generateRulesInsights(opts: {
  agentId:       string;
  agentName:     string;
  calls:         CallRow[];
  prevWeekCalls: CallRow[];
}): Promise<InsightRec[]> {
  const { agentId, agentName, calls, prevWeekCalls } = opts;
  const recs: InsightRec[] = [];

  if (calls.length === 0) {
    if (prevWeekCalls.length > 0) {
      recs.push({
        title:    `${agentName} no tuvo actividad esta semana`,
        body:     `La semana anterior registró ${prevWeekCalls.length} conversaciones. Verifica que el número esté activo y el agente habilitado.`,
        priority: 'high',
      });
    }
    return recs;
  }

  // Escalation rate
  const escalated    = calls.filter(c => ['escalated_whatsapp', 'transferred'].includes(c.outcome)).length;
  const escalPct     = Math.round((escalated / calls.length) * 100);
  if (escalPct > 30) {
    recs.push({
      title:         `Tasa de escalación alta: ${escalPct}%`,
      body:          'Más de 3 de cada 10 conversaciones se escalan. Identifica los temas frecuentes y agrégalos a la base de conocimiento.',
      metric_key:    'escalation_rate',
      current_value: escalPct,
      priority:      escalPct > 50 ? 'high' : 'medium',
    });
  }

  // CES dimensions
  for (const dim of CES_DIMS) {
    const avg = cesAvg(calls, dim);
    if (avg !== null && avg < 3.5) {
      recs.push({
        title:         `CES ${DIM_ES[dim]} bajo: ${avg.toFixed(1)}/5`,
        body:          DIM_ADVICE[dim],
        metric_key:    `ces_${dim}`,
        current_value: Math.round(avg * 10) / 10,
        priority:      avg < 2.5 ? 'high' : 'medium',
      });
    }
  }

  // Self-eval average
  const evalScores = calls.filter(c => c.self_eval_score).map(c => c.self_eval_score as number);
  if (evalScores.length >= 3) {
    const avg = evalScores.reduce((a, b) => a + b, 0) / evalScores.length;
    if (avg < 3.5) {
      recs.push({
        title:         `Auto-evaluación baja: ${avg.toFixed(1)}/5`,
        body:          'Revisa las llamadas con puntuación 1-2 y ajusta la Definición de Éxito del empleado.',
        metric_key:    'self_eval',
        current_value: Math.round(avg * 10) / 10,
        priority:      'high',
      });
    }
  }

  // Week-over-week drop
  if (prevWeekCalls.length > 0) {
    const drop = Math.round(((prevWeekCalls.length - calls.length) / prevWeekCalls.length) * 100);
    if (drop > 30) {
      recs.push({
        title:    `Caída del ${drop}% en conversaciones`,
        body:     `Esta semana: ${calls.length}. Semana anterior: ${prevWeekCalls.length}. Verifica disponibilidad del agente y estado del número.`,
        priority: 'medium',
      });
    }
  }

  // Goals behind
  const goals = await getGoalsWithProgress(agentId);
  for (const g of goals) {
    if (g.target <= 0 || g.period !== 'week') continue;
    const pct = g.progress / g.target;
    if (pct < 0.5) {
      recs.push({
        title:         `Meta "${g.title}" al ${Math.round(pct * 100)}%`,
        body:          `Lleva ${g.progress} de ${g.target} esta semana. Prioriza este objetivo en las próximas interacciones.`,
        metric_key:    'goal',
        current_value: Math.round(pct * 100),
        priority:      pct < 0.25 ? 'high' : 'medium',
      });
    }
  }

  return recs.slice(0, 5);
}
