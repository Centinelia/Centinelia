/**
 * Página HTML pública (protegida por token HMAC) donde el dueño puede editar
 * el plan antes de aprobarlo. Alternativa al binario aprobar/rechazar.
 *
 * GET  → renderiza formulario con el plan actual + textarea para correcciones.
 * POST → guarda las correcciones en plan.owner_notes + aprueba (status=pending).
 *        El executor lee owner_notes al inicio del prompt del target agent
 *        para que las siga como override.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqual } from 'crypto';
import { transitionAgentTask } from '@/lib/state-machines/agent-task';
import { recordHumanDecision } from '@/lib/human-gates/record';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

function safeEq(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try { return timingSafeEqual(bufA, bufB); } catch { return false; }
}

function pageResponse(html: string, status = 200) {
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function invalidPage(msg: string) {
  return pageResponse(`<!doctype html><html lang="es"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Enlace inválido</title>
    <style>
      body { margin: 0; padding: 32px 16px; background: #120726; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; }
      .card { max-width: 480px; margin: 60px auto 0; padding: 40px 32px; background: #1D1141; border: 1px solid #3D2E6A; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.25); text-align: center; }
      .icon { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, rgba(248,113,113,0.15), rgba(248,113,113,0.25)); border: 2px solid rgba(248,113,113,0.4); margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
      .icon span { font-size: 32px; color: #F87171; line-height: 1; }
      h1 { margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #F1EEFF; }
      p { margin: 0; font-size: 14px; color: #C8BEE8; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon"><span>!</span></div>
      <h1>Enlace inválido</h1>
      <p>${msg}</p>
    </div>
  </body></html>`);
}

function escape(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formPage(args: {
  id:            string;
  token:         string;
  taskTitle:     string;
  targetAgent:   string;
  plan:          any;
  priorNotes:    string;
}) {
  const { id, token, taskTitle, targetAgent, plan, priorNotes } = args;
  const stepsHtml = ((plan?.steps ?? []) as Array<{ n?: number; description?: string; tool_hint?: string }>)
    .map(s => `<li style="margin:0 0 12px;color:#F1EEFF;line-height:1.55;padding-left:0;list-style:none">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="flex-shrink:0;display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;background:rgba(155,109,255,0.15);color:#C8B6FF;border-radius:6px;font-size:12px;font-weight:700">${s.n ?? ''}</span>
        <div style="flex:1">
          <div style="color:#F1EEFF;font-size:14px">${escape(s.description ?? '')}</div>
          ${s.tool_hint ? `<div style="font-size:11px;color:#8C7FB8;margin-top:3px;font-style:italic">usará: ${escape(s.tool_hint)}</div>` : ''}
        </div>
      </div>
    </li>`)
    .join('');

  return pageResponse(`<!doctype html><html lang="es"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Editar plan — ${escape(targetAgent)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 16px; background: #120726; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #F1EEFF; min-height: 100vh; }
      .container { max-width: 640px; margin: 0 auto; }
      .card { background: #1D1141; border-radius: 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.25); border: 1px solid #3D2E6A; }
      .header-logo { text-align: center; margin-bottom: 24px; }
      .header-logo img { width: 140px; height: auto; opacity: 0.9; }
      .kicker { font-size: 11px; font-weight: 700; color: #9B6DFF; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
      h1 { margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #F1EEFF; line-height: 1.25; letter-spacing: -0.01em; }
      .sub { margin: 0 0 28px; color: #C8BEE8; font-size: 14px; line-height: 1.5; }
      .task-box { background: #2A1B5C; border-left: 3px solid #9B6DFF; padding: 14px 16px; border-radius: 8px; margin-bottom: 24px; }
      .task-box .label { font-size: 10px; font-weight: 700; color: #9B6DFF; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
      .task-box .value { font-size: 14px; color: #F1EEFF; line-height: 1.5; }
      .section-label { font-size: 10px; font-weight: 700; color: #8C7FB8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 10px; }
      .plan-summary { color: #C8BEE8; font-style: italic; font-size: 13px; line-height: 1.6; margin: 0 0 14px; padding: 12px 14px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid #3D2E6A; }
      .steps { margin: 0 0 28px; padding: 0; }
      .field-label { display: block; font-size: 11px; font-weight: 700; color: #C8B6FF; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 10px; }
      textarea { width: 100%; padding: 14px; background: #120726; border: 1.5px solid #3D2E6A; border-radius: 10px; font-size: 14px; font-family: inherit; color: #F1EEFF; line-height: 1.6; resize: vertical; transition: border-color 0.15s, box-shadow 0.15s; }
      textarea:focus { outline: none; border-color: #9B6DFF; box-shadow: 0 0 0 3px rgba(155,109,255,0.15); }
      textarea::placeholder { color: #6b5b8f; }
      .hint { margin: 8px 0 24px; font-size: 12px; color: #8C7FB8; line-height: 1.5; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; }
      .btn-primary { flex: 1; min-width: 200px; padding: 15px 28px; background: linear-gradient(135deg, #9B6DFF, #C8A2FF); color: #FFFFFF; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; letter-spacing: 0.02em; box-shadow: 0 4px 16px rgba(155,109,255,0.3); transition: transform 0.1s, box-shadow 0.15s; }
      .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(155,109,255,0.4); }
      .btn-reject { padding: 15px 24px; color: #F87171; text-decoration: none; font-size: 14px; font-weight: 500; text-align: center; border-radius: 12px; border: 1.5px solid rgba(248,113,113,0.3); background: transparent; transition: background 0.15s; }
      .btn-reject:hover { background: rgba(248,113,113,0.08); }
      .footer { margin: 24px 0 0; text-align: center; font-size: 11px; color: #6b5b8f; line-height: 1.6; }
      .footer a { color: #9B6DFF; text-decoration: none; }
      @media (max-width: 480px) {
        body { padding: 16px 12px; }
        .card { padding: 24px 20px; }
        h1 { font-size: 20px; }
        .actions { flex-direction: column; }
        .btn-primary, .btn-reject { min-width: 0; width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <div class="kicker">Editar plan de tarea</div>
        <h1>Plan de ${escape(targetAgent)}</h1>
        <p class="sub">Agrega correcciones o notas específicas. ${escape(targetAgent)} las va a tomar como override al ejecutar la tarea — pasan sobre el plan original.</p>

        <div class="task-box">
          <div class="label">Tarea</div>
          <div class="value">${escape(taskTitle)}</div>
        </div>

        <div class="section-label">Plan actual</div>
        ${plan?.summary ? `<div class="plan-summary">${escape(plan.summary)}</div>` : ''}
        <ol class="steps">${stepsHtml}</ol>

        <form method="POST" action="/api/portal/agent-tasks/${id}/edit-plan?token=${encodeURIComponent(token)}" style="margin:0">
          <label class="field-label" for="owner_notes">Tus correcciones / notas para ${escape(targetAgent)}</label>
          <textarea
            id="owner_notes"
            name="owner_notes"
            rows="6"
            placeholder="Ej: usa el correo backup del cliente (backup@cliente.mx). No envíes el jueves porque está de vacaciones. Revisa la plantilla V2 antes de mandar."
          >${escape(priorNotes)}</textarea>
          <p class="hint">Tus notas se inyectan al inicio del prompt de ${escape(targetAgent)} con prioridad máxima. Déjalo vacío si el plan está bien tal cual y solo quieres aprobar.</p>

          <div class="actions">
            <button type="submit" class="btn-primary">✓ Guardar y aprobar</button>
            <a href="/api/portal/agent-tasks/${id}/approve-plan?token=${encodeURIComponent(token)}&reject=1" class="btn-reject">Rechazar tarea</a>
          </div>
        </form>

        <p class="footer">
          Este enlace es de un solo uso — expira al aprobar, editar o rechazar.<br>
          <a href="https://www.centinelia.mx">centinelia.mx</a>
        </p>
      </div>
    </div>
  </body></html>`);
}

async function fetchTask(id: string, token: string) {
  const supabase = createAdminClient();
  const { data: task } = await supabase
    .from('agent_tasks')
    .select('id, status, plan_approval_token, title, plan, assigned_to')
    .eq('id', id)
    .single();

  if (!task || !task.plan_approval_token) return { err: 'La tarea no existe o no requiere aprobación.' } as const;
  if (!safeEq(token, task.plan_approval_token as string)) return { err: 'El token no coincide.' } as const;
  if (task.status !== 'awaiting_plan_approval') return { err: 'Este plan ya fue procesado. Consulta el portal para el estado actual.' } as const;

  return { task, supabase } as const;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const token  = new URL(req.url).searchParams.get('token') ?? '';
  if (!token || !id) return invalidPage('Falta token de aprobación.');

  const res = await fetchTask(id, token);
  if ('err' in res && res.err) return invalidPage(res.err);
  if (!('task' in res)) return invalidPage('Estado inesperado.');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name')
    .eq('id', res.task.assigned_to as string)
    .maybeSingle();

  const plan = (res.task.plan ?? {}) as any;
  return formPage({
    id,
    token,
    taskTitle:   String(res.task.title ?? ''),
    targetAgent: (agent?.agent_name as string | null) ?? 'Empleado',
    plan,
    priorNotes:  String(plan.owner_notes ?? ''),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const token  = new URL(req.url).searchParams.get('token') ?? '';
  if (!token || !id) return invalidPage('Falta token de aprobación.');

  const res = await fetchTask(id, token);
  if ('err' in res && res.err) return invalidPage(res.err);
  if (!('task' in res)) return invalidPage('Estado inesperado.');

  const form = await req.formData();
  const notes = String(form.get('owner_notes') ?? '').trim().slice(0, 3000);

  const nextPlan = { ...((res.task.plan ?? {}) as Record<string, unknown>), owner_notes: notes || null };
  await transitionAgentTask({
    supabase: res.supabase, taskId: id,
    toStatus: 'pending',
    actor:    'user',
    reason:   'plan_approved_with_edits',
    metadata: { has_owner_notes: !!notes },
    extraFields: {
      plan:                nextPlan,
      plan_approved_at:    new Date().toISOString(),
      plan_approval_token: null,
    },
  });
  recordHumanDecision({
    supabase: res.supabase, gateType: 'agent_task_plan', resourceId: id,
    decision: notes ? 'edit' : 'approve',
    channel:  'email_magic_link',
    reason:   notes ? 'plan_approved_with_owner_notes' : 'plan_approved_via_edit_page',
    metadata: { has_owner_notes: !!notes, notes_preview: notes.slice(0, 200) },
  });

  // Fire-and-forget: dispara el cron manualmente para esta tarea. Si el
  // cron secret existe llamamos al endpoint, si no cae al tick horario normal.
  const cronSecret = process.env.CRON_SECRET;
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  if (cronSecret) {
    void fetch(`${appUrl}/api/cron/process-tasks`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).catch(err => console.error('[edit-plan] trigger process-tasks failed:', err));
  }

  return pageResponse(`<!doctype html><html lang="es"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Plan aprobado</title>
    <style>
      body { margin: 0; padding: 32px 16px; background: #120726; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; }
      .card { max-width: 480px; margin: 60px auto 0; padding: 40px 32px; background: #1D1141; border: 1px solid #3D2E6A; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.25); text-align: center; }
      .icon { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.25)); border: 2px solid rgba(34,197,94,0.4); margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
      .icon span { font-size: 32px; color: #4ade80; line-height: 1; }
      h1 { margin: 0 0 12px; font-size: 24px; font-weight: 700; color: #F1EEFF; line-height: 1.3; }
      p { margin: 0; font-size: 14px; color: #C8BEE8; line-height: 1.6; }
      .footer { margin-top: 20px; font-size: 11px; color: #6b5b8f; }
      .footer a { color: #9B6DFF; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon"><span>✓</span></div>
      <h1>Plan aprobado${notes ? ' con tus correcciones' : ''}</h1>
      <p>Tu empleado ya lo está ejecutando.${notes ? ' Va a seguir tus notas con prioridad sobre el plan original.' : ''}</p>
      <p class="footer" style="margin-top:20px"><a href="https://www.centinelia.mx">centinelia.mx</a></p>
    </div>
  </body></html>`);
}
