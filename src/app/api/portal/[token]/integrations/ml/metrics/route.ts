export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { decrypt } from '@/lib/crypto';
import { mlRefreshToken } from '@/lib/mercadolibre/auth';

const ML_API = 'https://api.mercadolibre.com';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  const agent = { portal_email: resolved.portalEmail };
  if (auth.portalEmail && agent.portal_email !== auth.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: account } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, metadata')
    .eq('portal_email', agent.portal_email)
    .eq('provider', 'mercadolibre')
    .eq('status', 'active')
    .maybeSingle();
  if (!account) return NextResponse.json({ error: 'Mercado Libre no conectado' }, { status: 404 });

  const userId = (account.metadata as { user_id?: string })?.user_id ?? '';
  if (!userId) return NextResponse.json({ error: 'user_id de Mercado Libre no encontrado' }, { status: 400 });

  const expiresAt    = account.expires_at ? new Date(account.expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  let accessToken    = account.access_token as string;

  if (needsRefresh && account.refresh_token) {
    try {
      const plain     = decrypt(account.refresh_token as string);
      const refreshed = await mlRefreshToken(plain);
      accessToken     = refreshed.access_token;
      await supabase.from('integration_accounts').update({
        access_token:  refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at:    new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('portal_email', agent.portal_email).eq('provider', 'mercadolibre');
    } catch { /* use existing token */ }
  }

  const h = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  const today    = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [itemsRes, ordersRes] = await Promise.all([
    fetch(`${ML_API}/users/${userId}/items/search?limit=50`, { headers: h }),
    fetch(`${ML_API}/orders/search?seller=${userId}&order.status=paid&sort=date_desc&limit=20`, { headers: h }),
  ]);

  const itemsData  = itemsRes.ok  ? await itemsRes.json()  as { results?: string[] } : { results: [] };
  const ordersData = ordersRes.ok ? await ordersRes.json() as { results?: unknown[] } : { results: [] };

  const itemIds = itemsData.results ?? [];

  let visitsData: unknown = null;
  if (itemIds.length > 0) {
    const ids      = itemIds.slice(0, 50).join(',');
    const visitsRes = await fetch(
      `${ML_API}/visits/items?ids=${ids}&date_from=${fromDate}&date_to=${today}`,
      { headers: h },
    );
    if (visitsRes.ok) visitsData = await visitsRes.json();
  }

  return NextResponse.json({
    item_count:   itemIds.length,
    visits:       visitsData,
    recent_orders: ordersData.results ?? [],
    period: { from: fromDate, to: today },
  });
}
