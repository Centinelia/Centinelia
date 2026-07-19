export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getMlConnectorByToken } from '@/lib/integrations/mercadolibre';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const result = await getMlConnectorByToken(token, supabase);
  if (!result) return NextResponse.json({ error: 'Mercado Libre no conectado' }, { status: 404 });

  const items = await result.connector.items.list(50);
  return NextResponse.json({ items });
}
