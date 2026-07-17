import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

async function requireAdmin() {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('conversational_learnings')
    .select('id, body, dimension, source_count, status, created_at, approved_at, approved_by')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status, body } = await req.json() as {
    id:      string;
    status?: 'approved' | 'active' | 'rejected' | 'pending';
    body?:   string;
  };

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};

  if (status) {
    update.status = status;
    if (status === 'active') {
      update.approved_at  = new Date().toISOString();
      update.approved_by  = 'admin';
    }
  }
  if (body?.trim()) update.body = body.trim();

  const { error } = await supabase
    .from('conversational_learnings')
    .update(update)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  await supabase.from('conversational_learnings').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
