import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = createAdminClient();

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null; portal_email: string | null }>(token, 'id, features, portal_email', supabase);
  if (!agent || agent.portal_email !== session.portalEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const features = (agent.features ?? {}) as Record<string, boolean>;
  if (!features.outbound_calls) {
    return NextResponse.json({ error: 'Función no habilitada en este plan' }, { status: 403 });
  }

  const formData    = await req.formData();
  const file        = formData.get('file') as File | null;
  const motivo      = (formData.get('motivo') as string | null)?.trim();
  const scheduledAt = formData.get('scheduled_at') as string | null;

  if (!file || !motivo || !scheduledAt) {
    return NextResponse.json(
      { error: 'Se requieren: file (CSV), motivo y scheduled_at' },
      { status: 400 },
    );
  }

  const text  = await file.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'El CSV debe tener encabezados y al menos una fila de datos' },
      { status: 400 },
    );
  }

  const headers     = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const telefonoIdx = headers.indexOf('telefono') !== -1 ? headers.indexOf('telefono') : headers.indexOf('phone');

  if (telefonoIdx === -1) {
    return NextResponse.json(
      { error: 'El CSV debe tener una columna "telefono" o "phone"' },
      { status: 400 },
    );
  }

  const nombreIdx = ['nombre', 'name'].reduce<number>((acc, k) => {
    const idx = headers.indexOf(k);
    return acc === -1 ? idx : acc;
  }, -1);

  const contacts = lines
    .slice(1)
    .map(line => {
      const cols     = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const telefono = cols[telefonoIdx];
      if (!telefono) return null;
      return {
        agent_id:     agent.id,
        telefono,
        nombre:       nombreIdx !== -1 ? (cols[nombreIdx] || null) : null,
        motivo,
        scheduled_at: scheduledAt,
        status:       'pending',
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No se encontraron contactos válidos en el CSV' }, { status: 400 });
  }

  const { data: inserted, error } = await supabase.from('outbound_contacts').insert(contacts).select('id');
  if (error) {
    console.error('[portal/outbound/bulk]', error.message);
    return NextResponse.json({ error: 'Error al guardar contactos' }, { status: 500 });
  }

  const { recordOutboundBulkCreation } = await import('@/lib/state-machines/outbound-contact');
  await recordOutboundBulkCreation({
    supabase,
    contactIds: (inserted ?? []).map(r => r.id as string),
    actor:      'user',
    reason:     'portal_bulk_upload',
    metadata:   { count: contacts.length, agent_id: agent.id },
  });

  if (new Date(scheduledAt) <= new Date()) {
    const { triggerOutboundContacts } = await import('@/lib/outbound/outbound-trigger');
    triggerOutboundContacts(`portal bulk import ${contacts.length} contacts`, agent.id);
  }

  return NextResponse.json({ ok: true, imported: contacts.length });
}
