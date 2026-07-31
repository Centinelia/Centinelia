import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';


interface Params { params: Promise<{ meerkat: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('meerkat_version_history')
    .select('id, from_version, to_version, changed_at, changed_by, reason')
    .eq('meerkat_id', meerkat)
    .order('changed_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data ?? [] });
}
