/**
 * GET  /api/portal/[token]/social/calendar/[month]
 * PUT  /api/portal/[token]/social/calendar/[month]
 *
 * GET: Retorna el calendario editorial y sus slots para el mes indicado.
 * PUT: Crea o actualiza el calendario del mes y reemplaza sus slots.
 *
 * El parámetro [month] tiene formato 'YYYY-MM'. Se convierte a 'YYYY-MM-01'
 * para la columna de fecha en editorial_calendars.
 *
 * PUT body: {
 *   slots: Array<{
 *     scheduled_for: string;
 *     theme?: string;
 *     template_id?: string;
 *     recurring_rule?: string;
 *     auto_publish?: boolean;
 *     data_fields_defaults?: Record<string, unknown>;
 *   }>
 * }
 *
 * Seguridad: session + IDOR + feature flag (via guardPortalSocialRequest).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';

interface Params { params: Promise<{ token: string; month: string }> }

interface CalendarSlot {
  scheduled_for: string;
  theme?: string;
  template_id?: string;
  recurring_rule?: string;
  auto_publish?: boolean;
  data_fields_defaults?: Record<string, unknown>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token, month } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, supabase } = guard;

  // Convertir 'YYYY-MM' a 'YYYY-MM-01' para la consulta
  const monthDate = `${month}-01`;

  const { data: calendar, error: calErr } = await supabase
    .from('editorial_calendars')
    .select('*')
    .eq('portal_email', resolved.portalEmail)
    .eq('month', monthDate)
    .maybeSingle();

  if (calErr) {
    return NextResponse.json({ error: calErr.message }, { status: 500 });
  }

  if (!calendar) {
    return NextResponse.json({ ok: true, data: null, slots: [] });
  }

  // Obtener slots del calendario
  const { data: slots, error: slotsErr } = await supabase
    .from('calendar_slots')
    .select('*')
    .eq('calendar_id', calendar.id)
    .eq('portal_email', resolved.portalEmail)
    .order('scheduled_for', { ascending: true });

  if (slotsErr) {
    return NextResponse.json({ error: slotsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: calendar, slots: slots ?? [] });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { token, month } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, session, supabase } = guard;

  let body: { slots?: CalendarSlot[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const slots = Array.isArray(body.slots) ? body.slots : [];

  // Convertir 'YYYY-MM' a 'YYYY-MM-01'
  const monthDate = `${month}-01`;
  const now       = new Date().toISOString();

  // Upsert del calendario editorial del mes
  const { data: calendar, error: calErr } = await supabase
    .from('editorial_calendars')
    .upsert(
      {
        portal_email: resolved.portalEmail,
        month:        monthDate,
        status:       'draft',
        updated_at:   now,
        created_by:   session.portalEmail,
      },
      { onConflict: 'portal_email,month' },
    )
    .select()
    .single();

  if (calErr || !calendar) {
    return NextResponse.json({ error: calErr?.message ?? 'Error al crear calendario' }, { status: 500 });
  }

  // Reemplazar slots: eliminar los existentes y reinsertar
  const { error: deleteErr } = await supabase
    .from('calendar_slots')
    .delete()
    .eq('calendar_id', calendar.id)
    .eq('portal_email', resolved.portalEmail);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  if (slots.length > 0) {
    const slotRows = slots.map((s) => ({
      calendar_id:          calendar.id,
      portal_email:         resolved.portalEmail,
      scheduled_for:        s.scheduled_for,
      theme:                s.theme ?? null,
      template_id:          s.template_id ?? null,
      recurring_rule:       s.recurring_rule ?? null,
      auto_publish:         s.auto_publish ?? false,
      data_fields_defaults: s.data_fields_defaults ?? null,
    }));

    const { error: insertErr } = await supabase
      .from('calendar_slots')
      .insert(slotRows);

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  // Devolver el calendario actualizado con sus slots
  const { data: newSlots } = await supabase
    .from('calendar_slots')
    .select('*')
    .eq('calendar_id', calendar.id)
    .eq('portal_email', resolved.portalEmail)
    .order('scheduled_for', { ascending: true });

  return NextResponse.json({ ok: true, data: calendar, slots: newSlots ?? [] });
}
