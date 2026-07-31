import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkAccount } from '@/lib/compliance/account-guard';
import { isAdmin } from '@/lib/admin/auth';

export async function POST(req: NextRequest) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file         = formData.get('file') as File | null;
  const agent_id     = formData.get('agent_id') as string | null;
  const message      = formData.get('message') as string | null;
  const scheduled_at = formData.get('scheduled_at') as string | null;

  if (!file || !agent_id || !message || !scheduled_at) {
    return NextResponse.json(
      { error: 'Se requieren: file, agent_id, message y scheduled_at' },
      { status: 400 }
    );
  }

  const text  = await file.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    return NextResponse.json(
      { error: 'El CSV debe tener encabezados y al menos una fila de datos' },
      { status: 400 }
    );
  }

  const headers    = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const telefonoIdx = headers.indexOf('telefono') !== -1 ? headers.indexOf('telefono') : headers.indexOf('phone');

  if (telefonoIdx === -1) {
    return NextResponse.json(
      { error: 'El CSV debe tener una columna "telefono" o "phone"' },
      { status: 400 }
    );
  }

  const nombreIdx = ['nombre', 'name'].reduce<number>((acc, k) => {
    const idx = headers.indexOf(k);
    return acc === -1 ? idx : acc;
  }, -1);

  const recipients = lines
    .slice(1)
    .map(line => {
      const cols     = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const telefono = cols[telefonoIdx];
      if (!telefono) return null;
      return {
        telefono,
        nombre: nombreIdx !== -1 ? (cols[nombreIdx] || null) : null,
        status: 'pending',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No se encontraron contactos válidos en el CSV' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Account guard: block broadcasts for suspended/terminated accounts
  const { data: agentForGuard } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();
  const guard = await checkAccount(agentForGuard?.portal_email, supabase);
  if (!guard.canOperate) {
    return NextResponse.json({ error: `Cuenta ${guard.status}. No se pueden enviar broadcasts.` }, { status: 403 });
  }

  const { data: broadcast, error: broadcastErr } = await supabase
    .from('wa_broadcasts')
    .insert({ agent_id, message, scheduled_at, total: recipients.length })
    .select('id')
    .single();

  if (broadcastErr || !broadcast) {
    console.error('[wa/broadcast] broadcast insert error:', broadcastErr);
    return NextResponse.json({ error: 'Error al crear el broadcast' }, { status: 500 });
  }

  const rows = recipients.map(r => ({ ...r, broadcast_id: broadcast.id }));
  const { error: recipientsErr } = await supabase.from('wa_broadcast_recipients').insert(rows);

  if (recipientsErr) {
    console.error('[wa/broadcast] recipients insert error:', recipientsErr);
    await supabase.from('wa_broadcasts').delete().eq('id', broadcast.id);
    return NextResponse.json({ error: 'Error al guardar los contactos' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, broadcast_id: broadcast.id, total: recipients.length });
}
