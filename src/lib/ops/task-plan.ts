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
import { logLlmCall } from '@/lib/observability/llm-log';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface TaskPlan {
  goal:    string;
  steps:   { n: number; description: string; tool_hint?: string }[];
  assets:  string[];
  risks:   string[];
  success_metric: string;
  summary: string;
}

// Solo bandera acciones de ALTO STAKES reales que justifican pausar el
// trabajo del empleado para pedir permiso. Aplica [[feedback-empleados-inteligentes]]:
// el default es que el empleado ejecute; solo escala cuando el humano
// habría dicho "espera, esto es serio" (dinero, contratos, envíos masivos
// externos, datos personales).
//
// Explícitamente NO están: tamaño del texto, cantidad de iteraciones,
// palabras vagas como "todos los" o "múltiples" — el empleado hace tareas
// grandes sin pedir permiso, igual que un humano competente.
const HIGH_STAKES_KEYWORDS = [
  // Dinero real
  'pagar', 'pago', 'transferir', 'transferencia',
  'cobrar', 'reembolso', 'refund', 'depositar', 'depósito',
  // Compromiso legal
  'contrato', 'firmar', 'firma', 'demanda', 'abogado',
  'cancelar contrato', 'rescindir',
  // Compliance / privacidad
  'datos personales', 'rfc del cliente', 'documento fiscal',
  // Envío masivo externo (marketing, campañas amplias)
  'campaña masiva', 'blast', 'todos los clientes',
];

export function requiresPlanApproval(input: {
  tarea:            string;
  success_criteria?: string | null;
  max_iterations?:  number | null;
}): boolean {
  const { tarea, success_criteria } = input;
  if (!tarea) return false;
  const haystack = `${tarea} ${success_criteria ?? ''}`.toLowerCase();
  return HIGH_STAKES_KEYWORDS.some(k => haystack.includes(k));
}

/**
 * Segundo gate post-generación: si el plan tiene items en `risks` que huelen
 * a dinero/legal/comunicación externa masiva, escalamos aunque el keyword
 * filter inicial haya dejado pasar. El propio empleado ya analizó riesgos —
 * confiamos en su juicio.
 */
export function planRisksJustifyApproval(risks: string[] | undefined | null): boolean {
  if (!risks?.length) return false;
  const joined = risks.join(' ').toLowerCase();
  return HIGH_STAKES_KEYWORDS.some(k => joined.includes(k));
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

  const __t = Date.now();
  const __m = 'claude-sonnet-4-6';
  let resp;
  try {
    resp = await client.messages.create({
      model:      __m,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    void logLlmCall({ source: 'task_plan', model: __m, usage: resp.usage, latencyMs: Date.now() - __t, meta: { businessName, targetAgentName } });
  } catch (err) {
    void logLlmCall({ source: 'task_plan', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { businessName, targetAgentName } });
    throw err;
  }

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

/**
 * True cuando el empleado que DELEGA quiere que TODA delegación pase por
 * aprobación humana sin importar tamaño/keywords. Overrides thresholds de
 * requiresPlanApproval. Precedence: auto_approve_task_plans (skip approval)
 * > always_approve_delegations (force approval).
 *
 * El campo vive en `voice_agents.always_approve_delegations` (per-empleado,
 * default false). Si el agentId no existe o el campo es null, cae a false.
 * Se pasa el agentId del CALLER (delegador), no del delegatee.
 */
export async function orgAlwaysRequiresApproval(
  callerAgentId: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await supabase
    .from('voice_agents')
    .select('always_approve_delegations')
    .eq('id', callerAgentId)
    .maybeSingle();
  return !!(data?.always_approve_delegations);
}
