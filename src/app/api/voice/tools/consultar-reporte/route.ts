import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { STATUS_LABELS } from '@/lib/civic/folio';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { folio, numero_ciudadano } = args;

  const supabase = createAdminClient();

  let query = supabase
    .from('civic_reports')
    .select('folio, category, description, location_text, status, notes, created_at, resolved_at')
    .eq('agent_id', agent_id);

  if (folio) {
    query = query.eq('folio', String(folio).toUpperCase());
  } else if (numero_ciudadano) {
    query = query.eq('caller_number', numero_ciudadano).order('created_at', { ascending: false }).limit(3);
  } else {
    return NextResponse.json({ result: 'Por favor proporcione el número de folio o su número telefónico para consultar el reporte.' });
  }

  const { data } = await query;
  const reports = Array.isArray(data) ? data : data ? [data] : [];

  if (!reports.length) {
    return NextResponse.json({ result: folio
      ? `No encontré ningún reporte con el folio ${folio}. Verifique que el número sea correcto.`
      : 'No encontré reportes registrados con ese número telefónico.',
    });
  }

  const lines = reports.map(r => {
    const fecha  = new Date(r.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const status = STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status;
    const notas  = r.notes ? ` Notas: ${r.notes}.` : '';
    return `Folio ${r.folio}: ${r.category}, reportado el ${fecha}. Estatus actual: ${status}.${notas}`;
  });

  return NextResponse.json({
    result: reports.length === 1
      ? lines[0]
      : `Encontré ${reports.length} reportes a su nombre: ${lines.join(' / ')}`,
  });
}
