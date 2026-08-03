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
  return pageResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enlace inválido</title></head>
    <body style="margin:0;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:480px;margin:80px auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);text-align:center">
        <div style="width:56px;height:56px;border-radius:50%;background:#ef444420;margin:0 auto 20px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:28px;color:#ef4444">!</span>
        </div>
        <h1 style="margin:0 0 12px;font-size:22px;color:#1a0a3b">Enlace inválido</h1>
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5">${msg}</p>
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
    .map(s => `<li style="margin:0 0 8px;color:#1a0a3b;line-height:1.5">
      <strong style="color:#6c3bff">${s.n ?? ''}.</strong> ${escape(s.description ?? '')}
      ${s.tool_hint ? `<div style="font-size:12px;color:#9ca3af;margin-top:2px">↳ ${escape(s.tool_hint)}</div>` : ''}
    </li>`)
    .join('');

  return pageResponse(`<!doctype html><html lang="es"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Editar plan — ${escape(taskTitle)}</title>
  </head>
  <body style="margin:0;padding:24px 12px;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <form method="POST" action="/api/portal/agent-tasks/${id}/edit-plan?token=${encodeURIComponent(token)}" style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);padding:32px">
      <div style="font-size:11px;font-weight:600;color:#6c3bff;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Editar plan</div>
      <h1 style="margin:0 0 6px;font-size:22px;color:#1a0a3b">Plan de ${escape(targetAgent)}</h1>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Agrega correcciones o notas. ${escape(targetAgent)} las tendrá como override al ejecutar la tarea.</p>

      <div style="background:#f5f3ff;border-left:3px solid #6c3bff;padding:12px 14px;border-radius:4px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:600;color:#6c3bff;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Tarea</div>
        <div style="font-size:14px;color:#1a0a3b;line-height:1.5">${escape(taskTitle)}</div>
      </div>

      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Plan actual</div>
        <p style="color:#374151;font-style:italic;font-size:13px;line-height:1.5;margin:0 0 12px">${escape(plan?.summary ?? '')}</p>
        <ol style="margin:0;padding-left:0;list-style:none">${stepsHtml}</ol>
      </div>

      <label for="owner_notes" style="display:block;font-size:11px;font-weight:600;color:#6c3bff;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Tus correcciones / notas para ${escape(targetAgent)}</label>
      <textarea
        id="owner_notes"
        name="owner_notes"
        rows="6"
        placeholder="Ej: usar el correo backup del cliente (backup@cliente.mx), no enviar el jueves porque está de vacaciones, revisar plantilla V2 antes de mandar…"
        style="width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;color:#1a0a3b;line-height:1.5;box-sizing:border-box;resize:vertical"
      >${escape(priorNotes)}</textarea>

      <p style="margin:8px 0 20px;font-size:12px;color:#9ca3af">Tus notas se inyectan como instrucciones al inicio del prompt de ${escape(targetAgent)}. Puedes dejar el campo vacío si el plan está bien tal cual.</p>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button type="submit" style="flex:1;min-width:180px;padding:14px 24px;background:#6c3bff;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">
          Guardar y aprobar
        </button>
        <a href="/api/portal/agent-tasks/${id}/approve-plan?token=${encodeURIComponent(token)}&reject=1" style="padding:14px 24px;background:#fff;color:#6b7280;text-decoration:none;border:1px solid #e5e7eb;border-radius:8px;font-size:15px;font-weight:500;text-align:center">
          Rechazar
        </a>
      </div>
    </form>
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
  await res.supabase
    .from('agent_tasks')
    .update({
      plan:                nextPlan,
      status:              'pending',
      plan_approved_at:    new Date().toISOString(),
      plan_approval_token: null,
    })
    .eq('id', id);

  return pageResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plan aprobado</title></head>
    <body style="margin:0;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:480px;margin:80px auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);text-align:center">
        <div style="width:56px;height:56px;border-radius:50%;background:#22c55e20;margin:0 auto 20px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:28px;color:#22c55e">✓</span>
        </div>
        <h1 style="margin:0 0 12px;font-size:22px;color:#1a0a3b">Plan aprobado ${notes ? 'con tus correcciones' : ''}</h1>
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5">Tu empleado empieza en los próximos minutos. ${notes ? 'Va a seguir tus notas como override sobre el plan original.' : ''}</p>
      </div>
    </body></html>`);
}
