import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { recordOutboundBulkCreation } from '@/lib/state-machines/outbound-contact';

// POST /api/outbound/contacts/upload
// Form fields:
//   file        — CSV file (telefono, nombre, motivo columns)
//   agent_id    — UUID of the voice_agent
//   scheduled_at — ISO datetime for when to fire the calls

export async function POST(req: NextRequest) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const agent_id = formData.get('agent_id') as string | null;
  const scheduled_at = formData.get('scheduled_at') as string | null;

  if (!file || !agent_id || !scheduled_at) {
    return NextResponse.json(
      { error: 'Se requieren: file, agent_id y scheduled_at' },
      { status: 400 }
    );
  }

  const text = await file.text();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'El CSV debe tener encabezados y al menos una fila de datos' },
      { status: 400 }
    );
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));

  const telefonoIdx = headers.indexOf('telefono') !== -1
    ? headers.indexOf('telefono')
    : headers.indexOf('phone');

  if (telefonoIdx === -1) {
    return NextResponse.json(
      { error: 'El CSV debe tener una columna llamada "telefono" o "phone"' },
      { status: 400 }
    );
  }

  const nombreIdx = ['nombre', 'name'].reduce<number>((acc, k) => {
    const idx = headers.indexOf(k);
    return acc === -1 ? idx : acc;
  }, -1);

  const motivoIdx = ['motivo', 'reason', 'note'].reduce<number>((acc, k) => {
    const idx = headers.indexOf(k);
    return acc === -1 ? idx : acc;
  }, -1);

  const contacts = lines
    .slice(1)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const telefono = cols[telefonoIdx];
      if (!telefono) return null;

      return {
        agent_id,
        telefono,
        nombre: nombreIdx !== -1 ? (cols[nombreIdx] || null) : null,
        motivo: motivoIdx !== -1 ? (cols[motivoIdx] || null) : null,
        scheduled_at,
        status: 'pending',
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No se encontraron contactos válidos en el CSV' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase.from('outbound_contacts').insert(contacts).select('id');

  if (error) {
    console.error('[CSV upload] Supabase error:', error);
    return NextResponse.json({ error: 'Error al guardar contactos' }, { status: 500 });
  }

  // Registrar creación en state machine
  await recordOutboundBulkCreation({
    supabase,
    contactIds: (inserted ?? []).map(r => r.id as string),
    actor:      'admin',
    reason:     'csv_upload',
    metadata:   { count: contacts.length, agent_id },
  });

  return NextResponse.json({ ok: true, imported: contacts.length });
}
