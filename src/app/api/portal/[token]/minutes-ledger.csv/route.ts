import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

// Espejo de /ops-ledger.csv pero para minutos. Incluye duracion_segundos y
// minutos_cobrados para transparencia del redondeo `Math.ceil(duration/60)` —
// requisito Municipio: auditor pide desglose de por qué una llamada de 61s
// se cobró como 2 min.
export async function GET(req: NextRequest, { params: _params }: Params) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session?.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Fix M-e audit: sub-users solo bajan CSV si tienen módulo 'cuenta'.
  if (session.isSubUser && !(session.modules ?? []).includes('cuenta')) {
    return NextResponse.json({ error: 'Módulo cuenta requerido' }, { status: 403 });
  }

  // Fix N3 audit 2026-08-10: aceptar filtros de fecha ?from & ?to (YYYY-MM-DD).
  // Sin filtros = historial completo (default para retention 7 años Municipio).
  // El portal pasa el rango activo del UI para que auditor vea números que cuadren.
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam   = req.nextUrl.searchParams.get('to');
  const fromIso = fromParam ? `${fromParam}T00:00:00-06:00` : null; // tz México
  const toIso   = toParam   ? `${toParam}T23:59:59-06:00`   : null;

  const supabase = createAdminClient();
  // Union live + archive: la retention 7 años vive en `minutes_ledger_archive`
  // tras la migración `voice_calls_archive` (audit T10). El admin ya leía ambas;
  // el cliente sólo veía live y perdía histórico post-purge. Ver
  // [[feedback-audit-read-path-fidelity]].
  const buildQuery = (table: string) => {
    let q = supabase
      .from(table)
      .select('id, created_at, amount, kind, source, reference_id, description')
      .eq('portal_email', session.portalEmail)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });   // Fix B2 audit: stable tie-breaker por id
    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso)   q = q.lte('created_at', toIso);
    return q;
  };
  const [liveRes, archiveRes] = await Promise.all([
    buildQuery('minutes_ledger'),
    buildQuery('minutes_ledger_archive'),
  ]);
  const rows = [...(liveRes.data ?? []), ...(archiveRes.data ?? [])]
    .sort((a, b) => {
      const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return t !== 0 ? t : String(a.id).localeCompare(String(b.id));
    });

  // Fetch call durations for reference_ids that look like Vapi call IDs.
  // reference_id de kind='call' corresponde a vapi_call_id — permite mostrar
  // la duración real vs los minutos redondeados que se cobraron.
  const callRefs = (rows ?? [])
    .filter(r => r.kind === 'call' && r.reference_id)
    .map(r => r.reference_id as string);
  const durationByCall = new Map<string, number>();
  if (callRefs.length > 0) {
    const { data: calls } = await supabase
      .from('voice_calls')
      .select('vapi_call_id, duration_seconds')
      .in('vapi_call_id', callRefs);
    for (const c of (calls ?? [])) {
      if (c.vapi_call_id) durationByCall.set(c.vapi_call_id as string, (c.duration_seconds as number) ?? 0);
    }
  }

  const header = 'fecha,cantidad_min,tipo,fuente,referencia,duracion_segundos,minutos_cobrados,descripcion\n';
  // Fix B1 audit 2026-08-10: CSV injection guard. Prevent =/+/-/@ prefix formulas
  // que Excel ejecuta al abrir (data exfiltration via HYPERLINK, etc.).
  const csvSafe = (v: string) => v.replace(/^([=+\-@\t\r])/, "'$1");
  const body = (rows ?? []).map(r => {
    const desc = csvSafe((r.description ?? '').replace(/"/g, '""'));
    const duracionSeg = r.kind === 'call' && r.reference_id
      ? (durationByCall.get(r.reference_id as string) ?? '')
      : '';
    // minutos_cobrados es el |amount| para kind='call' (siempre negativo).
    // Facilita al auditor validar la fórmula ceil(duracion_seg/60).
    const minCobrados = r.kind === 'call' ? Math.abs(r.amount ?? 0) : '';
    return `${r.created_at},${r.amount},${r.kind},${r.source ?? ''},${r.reference_id ?? ''},${duracionSeg},${minCobrados},"${desc}"`;
  }).join('\n');

  const rangeLabel = fromIso || toIso ? `-${fromParam ?? 'inicio'}_a_${toParam ?? 'hoy'}` : '-completo';
  const csv = header + body + '\n';
  const filename = `minutes-ledger-${new Date().toISOString().slice(0, 10)}${rangeLabel}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
