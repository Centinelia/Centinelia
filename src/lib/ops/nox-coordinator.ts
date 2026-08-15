import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail } from '@/lib/email/send';
import { quickClassifyEmail } from '@/lib/ops/email-quick-classify';
import { logLlmCall } from '@/lib/observability/llm-log';
import {
  tryClaimReportIntent,
  commitReportIntent,
  releaseReportIntent,
} from '@/lib/ops/report-intent-lock';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NoxAgent {
  id:                 string;
  agent_name:         string | null;
  transfer_whatsapp:  string | null;
  client_email:       string | null;
  portal_email:       string;
}

interface SiblingInfo {
  id:         string;
  agent_name: string | null;
  role:       string | null;
}

// ── Find coordinator for a portal ─────────────────────────────────────────────
// Priority: is_coordinator flag first (Nox/Niva), then any active agent as fallback.
// Kept as findNoxAgent for backwards compatibility with existing call sites.

export async function findNoxAgent(portalEmail: string): Promise<NoxAgent | null> {
  const supabase = createAdminClient();
  // knowledge_base was dropped from voice_agents in e372013 (moved to organizations);
  // requesting it here made PostgREST silently return zero rows.
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, transfer_whatsapp, client_email, portal_email, features')
    .eq('portal_email', portalEmail)
    .eq('active', true);

  if (!agents?.length) return null;
  const coordinator = agents.find(a => (a.features as Record<string, unknown>)?.is_coordinator === true);
  return coordinator ?? (agents[0] as NoxAgent);
}

// ── Agent name matching ───────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '');
}

function matchScore(query: string, c: { agent_name?: string | null; role?: string | null }) {
  const q    = normalize(query);
  const name = normalize(c.agent_name ?? '');
  const role = normalize(c.role ?? '');
  if (name === q || role === q)              return 4;
  if (name.includes(q) || q.includes(name)) return 3;
  if (role.includes(q) || q.includes(role)) return 2;
  const tokens = q.split(/\s+/).filter(t => t.length > 2);
  return tokens.filter(t => `${name} ${role}`.includes(t)).length;
}

// ── Email processing: Nox routes incoming emails ──────────────────────────────

export async function processEmailWithNox(params: {
  portalEmail:  string;
  noxAgent:     NoxAgent;
  siblings:     SiblingInfo[];
  emailFrom:    string;
  emailSubject: string;
  emailBody:    string;
}): Promise<void> {
  const { noxAgent, siblings, emailFrom, emailSubject, emailBody, portalEmail } = params;

  if (!siblings.length) return;

  // C5 — clasificación determinística: spam / notificación automática no
  // ameritan delegación, pero tampoco ameritan pagar Claude para decidirlo.
  // Salimos temprano y ahorramos la llamada al modelo.
  const quick = quickClassifyEmail({ from: emailFrom, subject: emailSubject, body: emailBody });
  if (quick.category) return;

  const supabase = createAdminClient();

  const teamList = siblings
    .map(s => `- ${s.agent_name || 'Sin nombre'} (${s.role || 'Sin rol'})`)
    .join('\n');

  const coordinatorName = noxAgent.agent_name || 'Empleado';
  const systemPrompt = `Eres ${coordinatorName}, parte del equipo de trabajo de este negocio.
Tu trabajo en este momento es revisar un correo entrante y decidir si algún compañero del equipo debe encargarse de atenderlo.

Tus compañeros disponibles:
${teamList}

Reglas:
- Solo delega si hay una acción concreta que un compañero puede ejecutar.
- Si es un correo informativo, spam, notificación automática o no requiere acción de ningún compañero, usa sin_accion.
- Sé preciso al describir la tarea: qué hacer, a quién, qué información necesitan.`;

  const userMsg = `Correo recibido:
De: ${emailFrom}
Asunto: ${emailSubject || '(sin asunto)'}
Cuerpo:
${emailBody.slice(0, 1500)}`;

  const delegationTool: Anthropic.Tool = {
    name: 'delegar_a_agente',
    description: 'Delega una tarea a un miembro del equipo.',
    input_schema: {
      type: 'object',
      properties: {
        agente: { type: 'string', description: 'Nombre o rol del agente al que delegar' },
        tarea:  { type: 'string', description: 'Descripción clara de la tarea a ejecutar' },
      },
      required: ['agente', 'tarea'],
    },
  };

  const noActionTool: Anthropic.Tool = {
    name: 'sin_accion',
    description: 'El correo no requiere acción del equipo.',
    input_schema: {
      type: 'object',
      properties: {
        razon: { type: 'string', description: 'Por qué no se delega' },
      },
      required: ['razon'],
    },
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  let response;
  try {
    response = await client.messages.create({
      model:      __m,
      max_tokens: 512,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools:      [delegationTool, noActionTool],
      messages:   [{ role: 'user', content: userMsg }],
    });
    void logLlmCall({ source: 'nox_coordinator', model: __m, usage: response.usage, agentId: noxAgent.id, portalEmail, latencyMs: Date.now() - __t });
  } catch (err) {
    void logLlmCall({ source: 'nox_coordinator', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: noxAgent.id, portalEmail, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse || toolUse.name !== 'delegar_a_agente') return;

  const { agente, tarea } = toolUse.input as { agente: string; tarea: string };

  // Match the target sibling by name/role
  const target = [...siblings].sort((a, b) => matchScore(agente, b) - matchScore(agente, a))[0];
  if (!target) return;

  // Intent lock: si dos coordinadores del mismo portal (Nox + Niva marcados
  // ambos como coordinator, o un cron double-fire) procesan EL MISMO correo
  // en paralelo, deduplicamos ANTES de crear la task para no meter dos
  // tareas hermanas al pool. Bucketing 24h.
  const emailFingerprint = `${emailFrom}|${emailSubject}|${(emailBody ?? '').slice(0, 200)}`;
  const claim = await tryClaimReportIntent({
    portalEmail,
    kind:      'task',
    target:    target.id,
    subject:   `nox-delegation :: ${emailSubject || '(sin asunto)'}`,
    agentId:   noxAgent.id,
    agentName: noxAgent.agent_name,
    extraDedupe: emailFingerprint,
    sourceContext: {
      source:        'processEmailWithNox',
      email_from:    emailFrom,
      email_subject: emailSubject,
      target_agent:  target.id,
    },
  });
  if (!claim.claimed) {
    // Otro coordinador ya creó (o está creando) esta misma delegación.
    return;
  }

  // Queue as pending — the process-tasks cron picks it up asynchronously
  const { data: inserted, error: insertError } = await supabase.from('agent_tasks').insert({
    portal_email:   portalEmail,
    created_by:     noxAgent.id,
    assigned_to:    target.id,
    title:          tarea.slice(0, 200),
    description:    `Correo de ${emailFrom}: ${emailSubject}`,
    status:         'pending',
    trigger_type:   'email',
    source_context: emailBody.slice(0, 500),
  }).select('id').single();
  if (insertError) {
    console.error('[nox] task insert error:', insertError);
    await releaseReportIntent(claim.lockId);
    return;
  }
  await commitReportIntent(claim.lockId);
  // Guarda referencia inversa: la task apunta al lock que la parió (útil
  // para debug y para que el executor pueda saltarse el lock del envío
  // saliente si ya está cubierto por el lock del task).
  if (inserted?.id && claim.lockId) {
    await supabase
      .from('report_intent_locks')
      .update({ related_task_id: inserted.id as string })
      .eq('id', claim.lockId);
  }
}

// ── Cron monitoring: alert about overdue tasks ────────────────────────────────

interface OverdueTask {
  id:          string;
  title:       string;
  status:      string;
  assigned_to: string | null;
  started_at:  string | null;
  due_at:      string | null;
}

export async function runNoxMonitor(): Promise<{ portalsAlerted: number; tasksFound: number }> {
  const supabase = createAdminClient();

  // Tasks overdue: in_progress for >2h without completion, or past due_at
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: overdueTasks } = await supabase
    .from('agent_tasks')
    .select('id, portal_email, title, status, assigned_to, started_at, due_at')
    .in('status', ['pending', 'in_progress'])
    .or(`started_at.lt.${twoHoursAgo},due_at.lt.${new Date().toISOString()}`)
    .order('portal_email');

  if (!overdueTasks?.length) return { portalsAlerted: 0, tasksFound: 0 };

  // Group by portal_email
  const byPortal = new Map<string, OverdueTask[]>();
  for (const t of overdueTasks) {
    const list = byPortal.get(t.portal_email) ?? [];
    list.push(t);
    byPortal.set(t.portal_email, list);
  }

  let portalsAlerted = 0;

  for (const [portalEmail, tasks] of byPortal) {
    const nox = await findNoxAgent(portalEmail);
    if (!nox) continue;

    const recipient = nox.transfer_whatsapp || nox.client_email;
    if (!recipient) continue;

    const taskLines = tasks
      .map(t => {
        const age = t.started_at
          ? Math.round((Date.now() - new Date(t.started_at).getTime()) / 60000)
          : null;
        return `- ${t.title}${age ? ` (${age} min sin completar)` : ''}`;
      })
      .join('\n');

    const senderName = nox.agent_name || 'Centinelia';
    const message = `*${senderName} — Alerta de tareas pendientes*\n\nHay ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} sin completar:\n\n${taskLines}\n\nRevisa el portal para más detalles.`;

    // Intent lock: si Nox y otro coordinador (o dos crons pisados) llegan al
    // mismo escenario overdue, solo el primero alerta al owner. TTL 6h para
    // que si el problema persiste al día siguiente vuelva a avisar.
    const overdueIds = tasks.map(t => t.id).sort().join(',');
    const monitorTarget = nox.transfer_whatsapp || nox.client_email || 'unknown';
    const claim = await tryClaimReportIntent({
      portalEmail,
      kind:      'monitor_alert',
      target:    monitorTarget,
      subject:   `nox-monitor overdue tasks`,
      agentId:   nox.id,
      agentName: nox.agent_name,
      ttlHours:  6,
      extraDedupe: overdueIds,
      sourceContext: { source: 'runNoxMonitor', task_count: tasks.length, task_ids: tasks.map(t => t.id) },
    });
    if (!claim.claimed) {
      // Otro proceso ya avisó exactamente sobre esta misma cola de tareas.
      continue;
    }

    let sent = false;
    try {
      if (nox.transfer_whatsapp) {
        await sendWhatsApp(nox.transfer_whatsapp, message);
        sent = true;
      } else if (nox.client_email) {
        await sendEmail({
          to:      nox.client_email,
          subject: `Nox: ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} pendiente${tasks.length > 1 ? 's' : ''}`,
          html:    `<pre style="font-family:sans-serif">${message.replace(/\*/g, '<b>').replace(/\n/g, '<br>')}</pre>`,
        });
        sent = true;
      }
    } catch (err) {
      console.error('[nox-monitor] alert error:', err);
    }

    if (sent) await commitReportIntent(claim.lockId);
    else      await releaseReportIntent(claim.lockId);

    if (sent) portalsAlerted++;
  }

  return { portalsAlerted, tasksFound: overdueTasks.length };
}
