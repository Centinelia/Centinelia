import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';


export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['kb_sales', 'kb_portal']);

  const result = { kb_sales: '', kb_portal: '' };
  for (const row of data ?? []) {
    if (row.key === 'kb_sales')  result.kb_sales  = row.value;
    if (row.key === 'kb_portal') result.kb_portal = row.value;
  }

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { key, value } = await req.json() as { key: string; value: string };
  if (!['kb_sales', 'kb_portal'].includes(key)) {
    return NextResponse.json({ error: 'Key inválida' }, { status: 400 });
  }

  const supabase = createAdminClient();
  await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  return NextResponse.json({ ok: true });
}
