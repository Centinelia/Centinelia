import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { looksLikeBusinessSpecific } from '@/lib/ai/ces-eval';

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('conversational_learnings')
    .select('id, body, dimension, target_document, source_count, status, created_at, approved_at, approved_by')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  await supabase.from('conversational_learnings').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

// POST /api/admin/conversacional?action=purge-contaminated
// Archiva todos los aprendizajes cuyo body contiene contexto de negocio (dominio, montos, nombres).
// Es un dry_run por default: devuelve el listado sin cambiar nada. Pasa ?apply=1 para ejecutar.
export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action');
  if (action !== 'purge-contaminated') return NextResponse.json({ error: 'unknown action' }, { status: 400 });

  const apply    = req.nextUrl.searchParams.get('apply') === '1';
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('conversational_learnings')
    .select('id, body, status')
    .in('status', ['pending', 'approved', 'active']);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contaminated = (data ?? []).filter(r => looksLikeBusinessSpecific(r.body as string));
  if (!contaminated.length) return NextResponse.json({ mode: apply ? 'applied' : 'dry_run', found: 0, ids: [] });

  if (apply) {
    const ids = contaminated.map(r => r.id as string);
    const { error: updErr } = await supabase
      .from('conversational_learnings')
      .update({ status: 'archived' })
      .in('id', ids);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    mode:  apply ? 'applied' : 'dry_run',
    found: contaminated.length,
    ids:   contaminated.map(r => r.id),
    sample: contaminated.slice(0, 20).map(r => ({ id: r.id, status: r.status, body: (r.body as string).slice(0, 200) })),
  });
}
