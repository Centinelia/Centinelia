export const dynamic = 'force-dynamic';

/**
 * Consumo — /portal/[token]/oficina/redes/[naviId]/consumo
 *
 * Tabla de ops_log filtrada por agent_id, agrupada por día/mes y herramienta.
 * Muestra el total de operaciones consumidas por cada tool de Navi.
 * Vista de solo lectura.
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (R72).
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import { BarChart2 }                    from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';

interface Props { params: Promise<{ token: string; naviId: string }> }

interface OpsLogRow {
  id:         string;
  source:     string;
  ops_count:  number;
  created_at: string;
  status:     string;
}

interface DayGroup {
  date:   string;
  rows:   OpsLogRow[];
  total:  number;
}

/** Agrupa rows de ops_log por día (YYYY-MM-DD). */
function groupByDay(rows: OpsLogRow[]): DayGroup[] {
  const map = new Map<string, OpsLogRow[]>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(row);
  }
  return Array.from(map.entries())
    .map(([date, items]) => ({
      date,
      rows:  items,
      total: items.reduce((s, r) => s + (r.ops_count ?? 0), 0),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Suma total por herramienta (source). */
function totalBySource(rows: OpsLogRow[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    acc[r.source] = (acc[r.source] ?? 0) + (r.ops_count ?? 0);
  }
  return acc;
}

export default async function ConsumoPage({ params }: Props) {
  const { token, naviId } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  if (session?.portalEmail && session.portalEmail !== resolved.portalEmail) {
    redirect('/portal/login');
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!socialPublishingEnabled(org?.features)) {
    redirect(`/portal/${token}/oficina?tab=redes-disabled`);
  }

  // IDOR check
  const { data: navi } = await supabase
    .from('voice_agents')
    .select('id, agent_name, portal_email')
    .eq('id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!navi) notFound();

  // Obtener ops_log de los últimos 30 días para este agente
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: opsRows } = await supabase
    .from('ops_log')
    .select('id, source, ops_count, created_at, status')
    .eq('agent_id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows     = (opsRows ?? []) as OpsLogRow[];
  const grouped  = groupByDay(rows);
  const bySource = totalBySource(rows);
  const totalOps = rows.reduce((s, r) => s + (r.ops_count ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <OficinaPageHero
        icon={BarChart2}
        eyebrow="Gestor de redes"
        title="Consumo de operaciones"
        description={`Uso de Navi en los últimos 30 días — ${navi.agent_name ?? 'Navi'}.`}
      />

      {/* Resumen total */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: '#fff', border: '1px solid #E8E3F5' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>
            Total operaciones
          </p>
          <p className="text-[28px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>
            {totalOps.toLocaleString('es-MX')}
          </p>
          <p className="text-[11px]" style={{ color: '#6B6480' }}>Últimos 30 días</p>
        </div>
        <div
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: '#fff', border: '1px solid #E8E3F5' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>
            Herramientas usadas
          </p>
          <p className="text-[28px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>
            {Object.keys(bySource).length}
          </p>
          <p className="text-[11px]" style={{ color: '#6B6480' }}>Distintas herramientas</p>
        </div>
        <div
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: '#fff', border: '1px solid #E8E3F5' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>
            Promedio diario
          </p>
          <p className="text-[28px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>
            {grouped.length > 0 ? Math.round(totalOps / grouped.length).toLocaleString('es-MX') : '0'}
          </p>
          <p className="text-[11px]" style={{ color: '#6B6480' }}>Operaciones por día</p>
        </div>
      </div>

      {/* Resumen por herramienta */}
      {Object.keys(bySource).length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #E8E3F5' }}
        >
          <div
            className="px-4 py-3"
            style={{ background: '#F8F7FF', borderBottom: '1px solid #E8E3F5' }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#6B6480' }}>
              Por herramienta
            </p>
          </div>
          <div className="divide-y divide-[#F3F0FF]">
            {Object.entries(bySource)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <div key={source} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[13px]" style={{ color: '#1A0A3B' }}>
                    {source}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#6C3BFF' }}>
                    {count.toLocaleString('es-MX')}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Detalle por día */}
      {rows.length === 0 ? (
        <div
          className="rounded-xl flex flex-col items-center gap-2 py-12"
          style={{ background: '#F8F7FF', border: '1px dashed rgba(108,59,255,0.25)' }}
        >
          <BarChart2 size={28} style={{ color: '#6C3BFF', opacity: 0.4 }} />
          <p className="text-[13px] font-medium" style={{ color: '#1A0A3B' }}>
            Sin operaciones registradas
          </p>
          <p className="text-[12px]" style={{ color: '#6B6480' }}>
            Navi no ha utilizado herramientas de redes en los últimos 30 días.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#6B6480' }}>
            Detalle por día
          </p>
          {grouped.map(group => (
            <div
              key={group.date}
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid #E8E3F5' }}
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ background: '#F8F7FF', borderBottom: '1px solid #E8E3F5' }}
              >
                <span className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>
                  {new Intl.DateTimeFormat('es-MX', {
                    weekday: 'short', day: 'numeric', month: 'long',
                  }).format(new Date(group.date + 'T12:00:00'))}
                </span>
                <span className="text-[11px] font-semibold" style={{ color: '#6C3BFF' }}>
                  {group.total} ops
                </span>
              </div>
              <div className="divide-y divide-[#F3F0FF]">
                {group.rows.map(row => (
                  <div key={row.id} className="flex items-center justify-between px-4 py-2">
                    <span className="text-[12px]" style={{ color: '#1A0A3B' }}>
                      {row.source}
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{
                          background: row.status === 'success' ? '#F0FDF4' : '#FEF2F2',
                          color:      row.status === 'success' ? '#15803D' : '#B91C1C',
                        }}
                      >
                        {row.status === 'success' ? 'OK' : row.status}
                      </span>
                      <span className="text-[12px] font-medium tabular-nums" style={{ color: '#6C3BFF' }}>
                        {row.ops_count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
