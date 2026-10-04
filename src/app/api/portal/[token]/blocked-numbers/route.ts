import { NextResponse } from 'next/server';
import { withPortalAuth } from '@/lib/portal/with-portal-auth';
import { normalizeToE164 } from '@/lib/leads/dedup';

const PHONE_E164_RE = /^\+[0-9]{7,15}$/;

export const GET = withPortalAuth(
  async (_req, { supabase, org }) => {
    const { data } = await supabase
      .from('blocked_numbers')
      .select('id, phone_e164, reason, created_at, created_by')
      .eq('portal_email', org.portalEmail)
      .order('created_at', { ascending: false });

    return NextResponse.json(data ?? []);
  },
);

export const POST = withPortalAuth(
  async (req, { supabase, org, session }) => {
    const body = await req.json().catch(() => null) as { phone?: unknown; reason?: unknown } | null;
    const rawPhone  = typeof body?.phone  === 'string' ? body.phone.trim()  : '';
    const rawReason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!rawPhone) {
      return NextResponse.json({ error: 'Falta el número a bloquear.' }, { status: 400 });
    }

    let phone_e164: string;
    try {
      phone_e164 = normalizeToE164(rawPhone);
    } catch {
      return NextResponse.json({ error: 'Número inválido.' }, { status: 400 });
    }
    if (!PHONE_E164_RE.test(phone_e164)) {
      return NextResponse.json({ error: 'Número inválido. Debe tener al menos 7 dígitos con lada.' }, { status: 400 });
    }

    const reason = rawReason.length > 200 ? rawReason.slice(0, 200) : rawReason || null;
    const created_by = session.portalEmail || null;

    const { error } = await supabase
      .from('blocked_numbers')
      .insert({
        portal_email: org.portalEmail,
        phone_e164,
        reason,
        created_by,
      });

    if (error) {
      // Postgres unique_violation
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Este número ya está bloqueado.' }, { status: 409 });
      }
      console.error('[blocked-numbers POST] insert failed:', error);
      return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });
    }

    // El UI refetchea con GET después del POST — no necesitamos id/created_at aquí.
    return NextResponse.json({ phone_e164, reason, created_by });
  },
  { requireOwner: true, rateLimit: 'configWrite', rateLimitPrefix: 'blocked-numbers:write' },
);

export const DELETE = withPortalAuth(
  async (req, { supabase, org }) => {
    const url = new URL(req.url);
    const id    = url.searchParams.get('id');
    const phone = url.searchParams.get('phone');

    if (!id && !phone) {
      return NextResponse.json({ error: 'Falta id o phone.' }, { status: 400 });
    }

    let query = supabase
      .from('blocked_numbers')
      .delete()
      .eq('portal_email', org.portalEmail);

    if (id) {
      query = query.eq('id', id);
    } else if (phone) {
      let phone_e164: string;
      try {
        phone_e164 = normalizeToE164(phone);
      } catch {
        return NextResponse.json({ error: 'Número inválido.' }, { status: 400 });
      }
      query = query.eq('phone_e164', phone_e164);
    }

    const { error } = await query;
    if (error) {
      console.error('[blocked-numbers DELETE] failed:', error);
      return NextResponse.json({ error: 'No se pudo eliminar.' }, { status: 500 });
    }

    // Idempotente: no distinguimos 0 vs 1 fila borrada.
    return NextResponse.json({ ok: true });
  },
  { requireOwner: true, rateLimit: 'configWrite', rateLimitPrefix: 'blocked-numbers:write' },
);
