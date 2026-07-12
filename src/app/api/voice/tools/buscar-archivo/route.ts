import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConnector, type IntegrationRow } from '@/lib/connectors';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { busqueda } = args as { busqueda: string };

  if (!busqueda) return NextResponse.json({ result: 'Necesito que me indiques qué archivo buscar.' });

  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', agent_id)
    .single();

  if (!integration) {
    return NextResponse.json({ result: 'No tienes Google Drive ni OneDrive conectado. Conecta tu correo desde la Oficina.' });
  }

  try {
    const conn  = await getConnector(integration as IntegrationRow, supabase);
    const files = await conn.files.search(busqueda);

    if (!files.length) {
      return NextResponse.json({ result: `No encontré archivos que coincidan con "${busqueda}".` });
    }

    const top  = files.slice(0, 5);
    const list = top.map(f => `${f.name} (ID: ${f.id})`).join(', ');
    return NextResponse.json({
      result: `Encontré ${files.length} archivo(s) relacionado(s) con "${busqueda}": ${list}.${top.length > 1 ? ' ¿Cuál necesitas?' : ''}`,
    });
  } catch (err) {
    return NextResponse.json({ result: `Error al buscar archivos: ${String(err)}` });
  }
}
