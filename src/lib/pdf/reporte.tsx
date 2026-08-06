import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, S } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

export interface ReporteData {
  period:       string;
  clientName?:  string;   // Nombre del cliente al que se le entrega el reporte
  totalCalls:   number;
  leads:        number;
  appointments: number;
  orders:       number;
  minutesUsed:  number;
  minutesTotal: number;
  tasksUsed:    number;   // ai_ops_used del período
  tasksTotal:   number;   // ai_ops_limit del período
  outcomeBreakdown: { outcome: string; label: string; count: number; color: string }[];
  topHours?:    { hour: number; count: number }[];
}

// ─── Design tokens (editorial premium) ────────────────────────────────────────
const INK       = '#0F0A24';   // very dark ink
const SUBINK    = '#3E3654';   // secondary text
const HAIRLINE  = '#EAE7F0';   // dividers
const MUTED_BG  = '#F7F5FA';   // subtle bg
const MUTED_TXT = '#8A8299';

// ─── Section header with number ordinal ───────────────────────────────────────
function SectionOrdinal({ n, title, color }: { n: number; title: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14, gap: 10 }}>
      <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color, lineHeight: 1 }}>
        0{n}
      </Text>
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 1.4, textTransform: 'uppercase', paddingBottom: 3 }}>
        {title}
      </Text>
    </View>
  );
}

// ─── Big KPI card — number huge, minimal decoration ───────────────────────────
function KpiCard({ label, value, isPrimary }: { label: string; value: number; isPrimary?: boolean }) {
  return (
    <View style={{
      flex: 1,
      paddingVertical: 18,
      paddingHorizontal: 14,
      borderWidth: isPrimary ? 0 : 1,
      borderColor: HAIRLINE,
      backgroundColor: isPrimary ? INK : '#FFFFFF',
      borderRadius: 6,
    }}>
      <Text style={{
        fontSize: 38,
        fontFamily: 'Helvetica-Bold',
        color: isPrimary ? '#FFFFFF' : INK,
        lineHeight: 1,
        letterSpacing: -1.2,
      }}>
        {value}
      </Text>
      <Text style={{
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        color: isPrimary ? '#B8ACD4' : MUTED_TXT,
        marginTop: 8,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
      }}>
        {label}
      </Text>
    </View>
  );
}

export function ReportePdf({ brand, data }: { brand: BrandKit; data: ReporteData }) {
  const accent = brand.color || '#6C3BFF';
  const pct    = data.minutesTotal > 0 ? Math.min(Math.round((data.minutesUsed / data.minutesTotal) * 100), 100) : 0;
  const barCol = pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#22C55E';
  const tasksPct    = data.tasksTotal > 0 ? Math.min(Math.round((data.tasksUsed / data.tasksTotal) * 100), 100) : 0;
  const tasksBarCol = tasksPct >= 90 ? '#EF4444' : tasksPct >= 70 ? '#F59E0B' : '#22C55E';

  // Executive summary: 1-2 sentences narrating what happened
  const summarize = () => {
    if (data.totalCalls === 0 && data.tasksUsed === 0) return 'Este período no registró actividad.';
    const parts = [];
    if (data.totalCalls > 0)   parts.push(`${data.totalCalls} ${data.totalCalls === 1 ? 'llamada atendida' : 'llamadas atendidas'}`);
    if (data.tasksUsed > 0)    parts.push(`${data.tasksUsed} ${data.tasksUsed === 1 ? 'tarea completada' : 'tareas completadas'}`);
    if (data.leads > 0)        parts.push(`${data.leads} ${data.leads === 1 ? 'lead capturado' : 'leads capturados'}`);
    if (data.appointments > 0) parts.push(`${data.appointments} ${data.appointments === 1 ? 'cita agendada' : 'citas agendadas'}`);
    if (data.orders > 0)       parts.push(`${data.orders} ${data.orders === 1 ? 'pedido tomado' : 'pedidos tomados'}`);
    return `Este período tu equipo digital gestionó ${parts.join(', ')}.`;
  };

  const maxHourCount = data.topHours && data.topHours.length > 0
    ? Math.max(...data.topHours.map(h => h.count))
    : 0;

  return (
    <BrandedDoc brand={brand} docType="Reporte Mensual" subtitle={data.period}>

      {/* ═══ HERO — período grande estilo editorial ═══════════════════════════ */}
      <View style={{ marginBottom: 32, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: HAIRLINE }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
          Reporte de actividad{data.clientName ? ` · Preparado para ${data.clientName}` : ''}
        </Text>
        <Text style={{ fontSize: 32, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: -0.5, lineHeight: 1.1 }}>
          {data.period}
        </Text>
        <Text style={{ fontSize: 11, color: SUBINK, marginTop: 14, lineHeight: 1.6, maxWidth: 460 }}>
          {summarize()}
        </Text>
      </View>

      {/* ═══ 01 ACTIVIDAD ══════════════════════════════════════════════════════ */}
      <View style={{ marginBottom: 28 }}>
        <SectionOrdinal n={1} title="Actividad del período" color={accent} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <KpiCard label="Llamadas"  value={data.totalCalls} isPrimary />
          <KpiCard label="Leads"     value={data.leads} />
          <KpiCard label="Citas"     value={data.appointments} />
          <KpiCard label="Pedidos"   value={data.orders} />
        </View>
      </View>

      {/* ═══ 02 CONSUMO — minutos + tareas ══════════════════════════════════ */}
      <View style={{ marginBottom: 28 }}>
        <SectionOrdinal n={2} title="Consumo del período" color={accent} />
        <View style={{ flexDirection: 'row', gap: 10 }}>

          {/* Minutos */}
          <View style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 16, backgroundColor: MUTED_BG, borderRadius: 6 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: MUTED_TXT, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
              Minutos de llamadas
            </Text>
            <View style={[S.spaceBetween, { alignItems: 'baseline', marginBottom: 10 }]}>
              <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: -0.6, lineHeight: 1 }}>
                {data.minutesUsed}
                <Text style={{ fontSize: 11, color: MUTED_TXT }}> / {data.minutesTotal}</Text>
              </Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: barCol, letterSpacing: -0.3, lineHeight: 1 }}>
                {pct}%
              </Text>
            </View>
            <View style={{ height: 5, backgroundColor: '#FFFFFF', borderRadius: 3 }}>
              <View style={{ height: 5, width: `${pct}%`, backgroundColor: barCol, borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: 8, color: SUBINK, marginTop: 8 }}>
              Restan {Math.max(0, data.minutesTotal - data.minutesUsed)} minutos
            </Text>
          </View>

          {/* Tareas */}
          <View style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 16, backgroundColor: MUTED_BG, borderRadius: 6 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: MUTED_TXT, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
              Tareas automatizadas
            </Text>
            <View style={[S.spaceBetween, { alignItems: 'baseline', marginBottom: 10 }]}>
              <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: -0.6, lineHeight: 1 }}>
                {data.tasksUsed}
                <Text style={{ fontSize: 11, color: MUTED_TXT }}> / {data.tasksTotal}</Text>
              </Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: tasksBarCol, letterSpacing: -0.3, lineHeight: 1 }}>
                {tasksPct}%
              </Text>
            </View>
            <View style={{ height: 5, backgroundColor: '#FFFFFF', borderRadius: 3 }}>
              <View style={{ height: 5, width: `${tasksPct}%`, backgroundColor: tasksBarCol, borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: 8, color: SUBINK, marginTop: 8 }}>
              Restan {Math.max(0, data.tasksTotal - data.tasksUsed)} tareas
            </Text>
          </View>
        </View>
      </View>

      {/* ═══ 03 RESULTADOS ════════════════════════════════════════════════════ */}
      {data.outcomeBreakdown.length > 0 && (
        <View break style={{ marginBottom: 28 }} wrap={false}>
          <SectionOrdinal n={3} title="Resultados de llamadas" color={accent} />
          <View>
            {/* Table header — minimal, just uppercase labels */}
            <View style={{ flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: INK }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 1, textTransform: 'uppercase', flex: 1 }}>
                Resultado
              </Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 1, textTransform: 'uppercase', width: 60, textAlign: 'right' }}>
                Total
              </Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, letterSpacing: 1, textTransform: 'uppercase', width: 60, textAlign: 'right' }}>
                Share
              </Text>
            </View>
            {data.outcomeBreakdown.map((row, i) => {
              const rowPct = data.totalCalls > 0 ? Math.round((row.count / data.totalCalls) * 100) : 0;
              return (
                <View key={row.outcome} style={{
                  flexDirection: 'row',
                  paddingVertical: 12,
                  borderBottomWidth: i === data.outcomeBreakdown.length - 1 ? 0 : 1,
                  borderBottomColor: HAIRLINE,
                  alignItems: 'center',
                }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 4, height: 20, backgroundColor: row.color, borderRadius: 2 }} />
                    <Text style={{ fontSize: 11, color: INK }}>{row.label}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, width: 60, textAlign: 'right', letterSpacing: -0.3 }}>
                    {row.count}
                  </Text>
                  <Text style={{ fontSize: 11, color: SUBINK, width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>
                    {rowPct}%
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ═══ 04 HORAS PICO ════════════════════════════════════════════════════ */}
      {data.topHours && data.topHours.length > 0 && (
        <View style={{ marginBottom: 20 }} wrap={false}>
          <SectionOrdinal n={4} title="Horas pico de llamadas" color={accent} />
          <View style={{ paddingVertical: 6 }}>
            {data.topHours.map(({ hour, count }, i) => {
              const barPct = maxHourCount > 0 ? (count / maxHourCount) * 100 : 0;
              return (
                <View key={hour} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: i === data.topHours!.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK, width: 46, letterSpacing: -0.3 }}>
                    {String(hour).padStart(2, '0')}:00
                  </Text>
                  <View style={{ flex: 1, height: 8, backgroundColor: MUTED_BG, borderRadius: 4 }}>
                    <View style={{ height: 8, width: `${barPct}%`, backgroundColor: accent, borderRadius: 4 }} />
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, width: 30, textAlign: 'right' }}>
                    {count}
                  </Text>
                  <Text style={{ fontSize: 9, color: MUTED_TXT, width: 50 }}>
                    llamadas
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

    </BrandedDoc>
  );
}
