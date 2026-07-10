import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, status')
    .eq('approval_token', token)
    .single();

  if (!item) return htmlPage('Error', 'Token inválido o expirado.', false);
  if (item.status !== 'pending') return htmlPage(
    'Ya procesado',
    `Este elemento ya fue ${item.status === 'approved' ? 'aprobado' : 'rechazado'}.`,
    false,
  );

  await supabase
    .from('ops_inbox')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', item.id);

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_token')
    .eq('id', item.agent_id)
    .single();

  const portalUrl = agent?.portal_token ? `${BASE_URL}/portal/${agent.portal_token}?tab=oficina` : BASE_URL;

  return htmlPage('Rechazado', 'El elemento fue rechazado y no se enviará ninguna respuesta.', true, portalUrl);
}

function htmlPage(title: string, message: string, isReject: boolean, backUrl?: string): NextResponse {
  const color = isReject ? '#f59e0b' : '#ef4444';
  const icon  = isReject ? '✕' : '!';
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Centinelia</title>
</head>
<body style="margin:0;padding:0;background:#120726;font-family:Arial,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center">
  <div style="text-align:center;padding:48px 24px;max-width:360px">
    <div style="width:56px;height:56px;border-radius:50%;background:${color}22;border:2px solid ${color}40;margin:0 auto 20px;font-size:24px;line-height:56px">${icon}</div>
    <h1 style="color:#e2e8f0;font-size:20px;font-weight:700;margin:0 0 10px">${title}</h1>
    <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;margin:0 0 28px">${message}</p>
    ${backUrl ? `<a href="${backUrl}" style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Ver bandeja en el portal</a>` : ''}
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
