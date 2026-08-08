import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqual } from 'crypto';
import { transitionAgentTask } from '@/lib/state-machines/agent-task';
import { recordHumanDecision } from '@/lib/human-gates/record';
import { triggerProcessTasks } from '@/lib/ops/process-tasks-trigger';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

function safeEq(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try { return timingSafeEqual(bufA, bufB); } catch { return false; }
}

function htmlResponse(status: 'ok' | 'rejected' | 'invalid' | 'expired', message: string) {
  const palette = {
    ok:       { color: '#4ade80', tint: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)',   icon: '✓' },
    rejected: { color: '#9B6DFF', tint: 'rgba(155,109,255,0.15)', border: 'rgba(155,109,255,0.4)', icon: '✕' },
    expired:  { color: '#F87171', tint: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.4)', icon: '!' },
    invalid:  { color: '#F87171', tint: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.4)', icon: '!' },
  }[status];
  const title = status === 'ok' ? 'Plan aprobado' : status === 'rejected' ? 'Plan rechazado' : status === 'expired' ? 'Enlace expirado' : 'Enlace inválido';
  return new NextResponse(
    `<!doctype html><html lang="es"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="color-scheme" content="dark">
      <title>${title}</title>
      <style>
        body { margin: 0; padding: 32px 16px; background: #120726; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; }
        .card { max-width: 480px; margin: 60px auto 0; padding: 40px 32px; background: #1D1141; border: 1px solid #3D2E6A; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.25); text-align: center; }
        .icon { width: 64px; height: 64px; border-radius: 50%; background: ${palette.tint}; border: 2px solid ${palette.border}; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
        .icon span { font-size: 32px; color: ${palette.color}; line-height: 1; }
        h1 { margin: 0 0 12px; font-size: 24px; font-weight: 700; color: #F1EEFF; line-height: 1.3; }
        p { margin: 0; font-size: 14px; color: #C8BEE8; line-height: 1.6; }
        .footer { margin-top: 20px; font-size: 11px; color: #6b5b8f; }
        .footer a { color: #9B6DFF; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon"><span>${palette.icon}</span></div>
        <h1>${title}</h1>
        <p>${message}</p>
        <p class="footer" style="margin-top:20px"><a href="https://www.centinelia.mx">centinelia.mx</a></p>
      </div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function handle(req: NextRequest, id: string) {
  const supabase = createAdminClient();
  const url      = new URL(req.url);
  const token    = url.searchParams.get('token') ?? '';
  const reject   = url.searchParams.get('reject') === '1';
  const reason   = url.searchParams.get('reason') ?? null;

  if (!token || !id) return htmlResponse('invalid', 'Falta el token de aprobación.');

  const { data: task } = await supabase
    .from('agent_tasks')
    .select('id, status, plan_approval_token, title, assigned_to')
    .eq('id', id)
    .single();

  if (!task || !task.plan_approval_token) return htmlResponse('invalid', 'La tarea no existe o no requiere aprobación.');
  if (!safeEq(token, task.plan_approval_token as string)) return htmlResponse('invalid', 'El token no coincide.');

  if (task.status !== 'awaiting_plan_approval') {
    return htmlResponse('expired', 'Este plan ya fue procesado. Consulta el portal para el estado actual.');
  }

  if (reject) {
    await transitionAgentTask({
      supabase, taskId: id,
      toStatus: 'cancelled',
      actor:    'user',
      reason:   'plan_rejected_via_email',
      metadata: { rejection_reason: reason },
      extraFields: {
        plan_rejected_at:      new Date().toISOString(),
        plan_rejection_reason: reason,
        plan_approval_token:   null,
      },
    });
    recordHumanDecision({
      supabase, gateType: 'agent_task_plan', resourceId: id,
      decision: 'reject', channel: 'email_magic_link',
      reason: 'plan_rejected_via_email',
      metadata: { rejection_reason: reason, title: task.title },
    });
    return htmlResponse('rejected', 'La tarea quedó cancelada. Puedes pedirle a tu empleado que la reintente con instrucciones diferentes.');
  }

  // Aprobar: marcar pending Y disparar ejecución inmediata (no esperar cron).
  await transitionAgentTask({
    supabase, taskId: id,
    toStatus: 'pending',
    actor:    'user',
    reason:   'plan_approved_via_email',
    extraFields: {
      plan_approved_at:    new Date().toISOString(),
      plan_approval_token: null,
    },
  });
  recordHumanDecision({
    supabase, gateType: 'agent_task_plan', resourceId: id,
    decision: 'approve', channel: 'email_magic_link',
    reason: 'plan_approved_via_email',
    metadata: { title: task.title, assigned_to: task.assigned_to },
  });

  triggerProcessTasks(`approve-plan ${id}`);

  return htmlResponse(
    'ok',
    'Plan aprobado. Tu empleado ya lo está ejecutando. Puedes seguirlo en el portal, sección Tareas.',
  );
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return handle(req, id);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return handle(req, id);
}
