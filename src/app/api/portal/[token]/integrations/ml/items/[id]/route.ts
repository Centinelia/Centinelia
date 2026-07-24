export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getMlConnectorByToken } from '@/lib/integrations/mercadolibre';
import type { MLItem } from '@/lib/connectors/mercadolibre';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase       = createAdminClient();

  const result = await getMlConnectorByToken(token, supabase);
  if (!result) return NextResponse.json({ error: 'Mercado Libre no conectado' }, { status: 404 });
  if (auth.portalEmail && result.portalEmail !== auth.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as Partial<Pick<MLItem, 'price' | 'available_quantity' | 'title'>>;
  if (!body.price && body.available_quantity === undefined && !body.title) {
    return NextResponse.json({ error: 'Proporciona al menos un campo a actualizar: price, available_quantity, title' }, { status: 400 });
  }

  const ok = await result.connector.items.update(id, body);
  if (!ok) return NextResponse.json({ error: 'No se pudo actualizar la publicación en Mercado Libre' }, { status: 502 });

  return NextResponse.json({ ok: true });
}
