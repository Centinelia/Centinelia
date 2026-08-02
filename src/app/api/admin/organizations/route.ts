export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/admin/organizations?search=... → lista organizaciones para autocomplete.
// Busca por portal_email o name (ilike). Sin search devuelve las 20 más recientes.
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const search = (req.nextUrl.searchParams.get('search') ?? '').trim();
  const supabase = createAdminClient();

  let query = supabase
    .from('organizations')
    .select('portal_email, name, billing_model, active_contract_id')
    .order('name', { ascending: true, nullsFirst: false })
    .limit(20);

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`portal_email.ilike.${pattern},name.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin/organizations GET] error:', error);
    return NextResponse.json({ error: 'query_failed', message: error.message }, { status: 500 });
  }

  return NextResponse.json({ organizations: data ?? [] });
}
