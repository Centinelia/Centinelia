// Admin view + acciones para la retry queue de handoff replies.
// Ver src/app/api/cron/retry-failed-handoffs/route.ts + migrations/20260731_handoff_retry_queue.sql
// + [[audit-deferred-handoff]] sección F opción A.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') ?? 'all';
  const supabase = createAdminClient();

  let query = supabase
    .from('handoff_failed_responses')
    .select('id, human_request_id, from_email, subject, retry_count, first_failed_at, last_attempted_at, last_error, next_retry_at, resolved_at, notified_admin_at')
    .order('first_failed_at', { ascending: false })
    .limit(200);

  if (status === 'pending') {
    query = query.is('resolved_at', null).not('next_retry_at', 'is', null);
  } else if (status === 'resolved') {
    query = query.not('resolved_at', 'is', null);
  } else if (status === 'gave_up') {
    query = query.is('resolved_at', null).is('next_retry_at', null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

// Manual retry: fuerza next_retry_at = NOW() para que el cron lo tome en la siguiente corrida.
// Útil si el admin arregló la causa raíz y quiere acelerar reintento sin esperar backoff.
export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('handoff_failed_responses')
    .update({
      next_retry_at:     new Date().toISOString(),
      // Reset del contador si el admin fuerza retry — le da 5 nuevos intentos.
      retry_count:       0,
      notified_admin_at: null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', id)
    .is('resolved_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
