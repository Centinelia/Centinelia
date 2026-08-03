/**
 * Task-plan generation and approval helpers.
 *
 * Cuando delegar_tarea detecta que una tarea es lo bastante grande (por
 * success_criteria + iteraciones, longitud, o palabras clave), pausamos la
 * ejecución y pedimos aprobación humana del plan por correo con magic link.
 *
 * El cron process-tasks solo levanta tareas con status='pending', asi que
 * mientras esté en awaiting_plan_approval no se ejecuta.
 */
import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface TaskPlan {
  goal:    string;
  steps:   { n: number; description: string; tool_hint?: string }[];
  assets:  string[];
  risks:   string[];
  success_metric: string;
  summary: string;
}

const APPROVAL_KEYWORDS = ['campaña','lanzamiento','secuencia','múltiples','multiples','todas las','todos los','plan completo'];
const LARGE_TASK_CHARS  = 200;
const LARGE_GOAL_ITER   = 3;

export function requiresPlanApproval(input: {
  tarea:            string;
  success_criteria?: string | null;
  max_iterations?:  number | null;
}): boolean {
  const { tarea, success_criteria, max_iterations } = input;
  if (!tarea) return false;
  if (max_iterations && max_iterations >= LARGE_GOAL_ITER) return true;
  if (tarea.length >= LARGE_TASK_CHARS) return true;
  if (success_criteria && success_criteria.length >= LARGE_TASK_CHARS) return true;
  const lower = tarea.toLowerCase();
  return APPROVAL_KEYWORDS.some(k => lower.includes(k));
}

export async function generateTaskPlan(args: {
  client:     Anthropic;
  tarea:      string;
  contexto?:  string | null;
  success_criteria?: string | null;
  businessName: string;
  targetAgentName: string;
  targetRole?: string | null;
}): Promise<TaskPlan> {
  const { client, tarea, contexto, success_criteria, businessName, targetAgentName, targetRole } = args;

  const prompt = `Vas a producir un PLAN estructurado para una tarea que se va a delegar a ${targetAgentName}${targetRole ? ` (${targetRole})` : ''}, empleado digital de ${businessName}.

El plan será revisado y aprobado por un humano ANTES de ejecutarse. Sé preciso: si aprobado, ${targetAgentName} lo va a intentar cumplir exactamente como lo describas.

Tarea: ${tarea}
${contexto ? `Contexto: ${contexto}` : ''}
${success_criteria ? `Criterio de éxito: ${success_criteria}` : ''}

Produce JSON con esta forma exacta:
{
  "goal": "Descripción de 1 oración de lo que se logrará",
  "steps": [
    { "n": 1, "description": "Paso concreto y accionable", "tool_hint": "opcional: nombre de tool que probablemente usará" },
    ...
  ],
  "assets": ["opcional: entregables que se producirán, ej: 'correo a cliente X', 'documento PDF Y'"],
  "risks": ["opcional: cosas que podrían salir mal o donde se necesitaría más info"],
  "success_metric": "Cómo sabemos que se logró — una métrica o condición verificable",
  "summary": "1 oración con el pitch: 'Voy a hacer X para lograr Y'"
}

Reglas:
- Máximo 6 pasos.
- Cada paso debe ser algo que un empleado digital pueda ejecutar con sus tools (correo, calendario, docs, etc.).
- Si el plan implica llamar a un cliente real o mover dinero, ponlo explícitamente en risks.
- Responde SOLO JSON válido, sin markdown.`;

  const resp = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = resp.content.find(b => b.type === 'text');
  const raw   = block?.type === 'text' ? block.text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('El modelo no produjo plan JSON.');

  const parsed = JSON.parse(match[0]) as Partial<TaskPlan>;
  return {
    goal:           parsed.goal ?? tarea.slice(0, 200),
    steps:          Array.isArray(parsed.steps) ? parsed.steps.slice(0, 8).map((s, i) => ({
      n:            s.n ?? i + 1,
      description:  String(s.description ?? ''),
      tool_hint:    s.tool_hint ? String(s.tool_hint) : undefined,
    })).filter(s => s.description) : [],
    assets:         Array.isArray(parsed.assets) ? parsed.assets.map(a => String(a)).filter(Boolean).slice(0, 8) : [],
    risks:          Array.isArray(parsed.risks) ? parsed.risks.map(r => String(r)).filter(Boolean).slice(0, 5) : [],
    success_metric: parsed.success_metric ?? success_criteria ?? 'Tarea completada según lo descrito.',
    summary:        parsed.summary ?? `Ejecutar: ${tarea.slice(0, 150)}`,
  };
}

export function generatePlanApprovalToken(): string {
  return randomBytes(24).toString('hex');
}

export async function orgAutoApprovesPlans(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await supabase
    .from('organizations')
    .select('auto_approve_task_plans')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  return !!(data?.auto_approve_task_plans);
}
