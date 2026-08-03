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

function htmlResponse(status: 'ok' | 'rejected' | 'invalid' | 'expired', message: string) {
  const color = status === 'ok' ? '#22c55e' : status === 'rejected' ? '#6c3bff' : '#ef4444';
  const title = status === 'ok'
    ? 'Plan aprobado'
    : status === 'rejected'
      ? 'Plan rechazado'
      : status === 'expired'
        ? 'Enlace expirado'
        : 'Enlace inválido';
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
    <body style="margin:0;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:480px;margin:80px auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:${color}20;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;color:${color};">${status === 'ok' ? '✓' : status === 'rejected' ? '✕' : '!'}</span>
        </div>
        <h1 style="margin:0 0 12px;font-size:22px;color:#1a0a3b;">${title}</h1>
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">${message}</p>
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
    await supabase
      .from('agent_tasks')
      .update({
        status:                'cancelled',
        plan_rejected_at:      new Date().toISOString(),
        plan_rejection_reason: reason,
        plan_approval_token:   null,
      })
      .eq('id', id);
    return htmlResponse('rejected', 'La tarea quedó cancelada. Puedes pedirle a tu empleado que la reintente con instrucciones diferentes.');
  }

  // Aprobar: dejamos la tarea lista para el cron process-tasks.
  await supabase
    .from('agent_tasks')
    .update({
      status:              'pending',
      plan_approved_at:    new Date().toISOString(),
      plan_approval_token: null,
    })
    .eq('id', id);

  return htmlResponse(
    'ok',
    'Plan aprobado. Tu empleado empieza a ejecutarlo en los próximos minutos. Puedes seguirlo en el portal, sección de tareas.',
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
