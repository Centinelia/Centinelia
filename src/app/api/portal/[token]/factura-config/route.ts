import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export interface FacturaConfig {
  rfc?:              string;
  direccion?:        string;
  condiciones_pago?: string;
  folio_prefix?:     string;
  incluir_iva?:      boolean;
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('features').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config = ((agent.features as Record<string, unknown>)?.factura_config ?? {}) as FacturaConfig;
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const body      = await req.json() as FacturaConfig;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = (agent.features as Record<string, unknown>) ?? {};
  const merged   = { ...existing, factura_config: { ...(existing.factura_config as object ?? {}), ...body } };

  const { error } = await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
