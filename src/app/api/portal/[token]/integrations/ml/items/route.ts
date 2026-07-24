export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getMlConnectorByToken } from '@/lib/integrations/mercadolibre';
import type { MLCreateItemInput } from '@/lib/connectors/mercadolibre';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const result = await getMlConnectorByToken(token, supabase);
  if (!result) return NextResponse.json({ error: 'Mercado Libre no conectado' }, { status: 404 });
  if (auth.portalEmail && result.portalEmail !== auth.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as MLCreateItemInput;
  if (!body.title || !body.category_id || !body.price || !body.available_quantity) {
    return NextResponse.json({ error: 'Faltan campos requeridos: title, category_id, price, available_quantity' }, { status: 400 });
  }

  const item = await result.connector.items.create(body);
  if (!item) return NextResponse.json({ error: 'No se pudo crear la publicación en Mercado Libre' }, { status: 502 });

  return NextResponse.json({ item });
}
