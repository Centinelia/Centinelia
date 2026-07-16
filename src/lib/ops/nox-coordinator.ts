import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail } from '@/lib/email/send';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

// ── Types ─────────────────────────────────────────────────────────────────────

interface NoxAgent {
  id:                 string;
  agent_name:         string | null;
  transfer_whatsapp:  string | null;
  client_email:       string | null;
  knowledge_base:     string | null;
  portal_email:       string;
}

interface SiblingInfo {
  id:         string;
  agent_name: string | null;
  role:       string | null;
}

// ── Find Nox agent for a portal ───────────────────────────────────────────────

export async function findNoxAgent(portalEmail: string): Promise<NoxAgent | null> {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, transfer_whatsapp, client_email, knowledge_base, portal_email, features')
    .eq('portal_email', portalEmail)
    .eq('active', true);

  if (!agents?.length) return null;
  const nox = agents.find(a => (a.features as Record<string, unknown>)?.is_coordinator === true);
  return nox ?? null;
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

  const teamList = siblings
    .map(s => `- ${s.agent_name || 'Sin nombre'} (${s.role || 'Sin rol'})`)
    .join('\n');

  const systemPrompt = `Eres Nox, el director coordinador del equipo de ${portalEmail}.
Tu trabajo es revisar correos entrantes y decidir si algún miembro del equipo debe encargarse de atenderlo.

Tu equipo disponible:
${teamList}

Reglas:
- Solo delega si hay una acción concreta que un agente del equipo puede ejecutar.
- Si es un correo informativo, spam, notificación automática o no requiere acción, usa sin_accion.
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
  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system:     systemPrompt,
    tools:      [delegationTool, noActionTool],
    messages:   [{ role: 'user', content: userMsg }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse || toolUse.name !== 'delegar_a_agente') return;

  const { agente, tarea } = toolUse.input as { agente: string; tarea: string };

  // Call the existing delegation route with Nox as the caller
  await fetch(`${APP_URL}/api/voice/tools/delegar-tarea?agent_id=${noxAgent.id}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolCallList: [{
        id:   `nox_email_${Date.now()}`,
        type: 'function',
        function: {
          name:      'delegar_tarea',
          arguments: {
            agente,
            tarea,
            contexto: `Correo de ${emailFrom}: ${emailSubject}`,
          },
        },
      }],
    }),
  }).catch(err => console.error('[nox] delegation fetch error:', err));
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

    const message = `*Nox — Alerta de tareas pendientes*\n\nHay ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} sin completar:\n\n${taskLines}\n\nRevisa el portal para más detalles.`;

    if (nox.transfer_whatsapp) {
      await sendWhatsApp(nox.transfer_whatsapp, message)
        .catch(err => console.error('[nox-monitor] WhatsApp error:', err));
    } else if (nox.client_email) {
      await sendEmail({
        to:      nox.client_email,
        subject: `Nox: ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} pendiente${tasks.length > 1 ? 's' : ''}`,
        html:    `<pre style="font-family:sans-serif">${message.replace(/\*/g, '<b>').replace(/\n/g, '<br>')}</pre>`,
      }).catch(err => console.error('[nox-monitor] email error:', err));
    }

    portalsAlerted++;
  }

  return { portalsAlerted, tasksFound: overdueTasks.length };
}
