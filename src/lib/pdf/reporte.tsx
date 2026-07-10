import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, SectionTitle, S } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

export interface ReporteData {
  period:       string;
  totalCalls:   number;
  leads:        number;
  appointments: number;
  orders:       number;
  minutesUsed:  number;
  minutesTotal: number;
  outcomeBreakdown: { outcome: string; label: string; count: number; color: string }[];
  topHours?:    { hour: number; count: number }[];
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{
      flex: 1,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* colored top accent */}
      <View style={{ height: 3, backgroundColor: color }} />
      <View style={{ paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color, lineHeight: 1 }}>
          {value}
        </Text>
        <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', marginTop: 5, letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

export function ReportePdf({ brand, data }: { brand: BrandKit; data: ReporteData }) {
  const accent  = brand.color || '#6C3BFF';
  const pct     = data.minutesTotal > 0 ? Math.min(Math.round((data.minutesUsed / data.minutesTotal) * 100), 100) : 0;
  const barCol  = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';

  return (
    <BrandedDoc brand={brand} docType="Reporte Mensual" subtitle={data.period}>

      {/* KPI Grid */}
      <View style={S.section}>
        <SectionTitle title="Actividad del período" color={accent} />
        <View style={[S.row, { gap: 10 }]}>
          <StatBox label="Llamadas"  value={data.totalCalls}   color={accent} />
          <StatBox label="Leads"     value={data.leads}        color="#6C3BFF" />
          <StatBox label="Citas"     value={data.appointments} color="#3b82f6" />
          <StatBox label="Pedidos"   value={data.orders}       color="#f59e0b" />
        </View>
      </View>

      {/* Minutes */}
      <View style={S.section}>
        <SectionTitle title="Consumo de minutos" color={accent} />
        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 16 }}>
          <View style={[S.row, { justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }]}>
            <Text style={S.value}>{data.minutesUsed} de {data.minutesTotal} minutos usados</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: barCol }}>{pct}%</Text>
          </View>
          <View style={{ height: 7, backgroundColor: '#f3f4f6', borderRadius: 4 }}>
            <View style={{ height: 7, width: `${pct}%`, backgroundColor: barCol, borderRadius: 4 }} />
          </View>
          <Text style={[S.muted, { marginTop: 6 }]}>
            {data.minutesTotal - data.minutesUsed} minutos disponibles
          </Text>
        </View>
      </View>

      {/* Outcome breakdown */}
      {data.outcomeBreakdown.length > 0 && (
        <View style={S.section}>
          <SectionTitle title="Resultados de llamadas" color={accent} />
          <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <View style={[S.tableHead, { backgroundColor: `${accent}0F` }]}>
              <Text style={[S.label, { flex: 1, marginBottom: 0 }]}>Resultado</Text>
              <Text style={[S.label, { width: 60, textAlign: 'right', marginBottom: 0 }]}>Total</Text>
              <Text style={[S.label, { width: 60, textAlign: 'right', marginBottom: 0 }]}>%</Text>
            </View>
            {data.outcomeBreakdown.map((row, i) => (
              <View key={row.outcome} style={[S.tableRow, { borderBottomWidth: i === data.outcomeBreakdown.length - 1 ? 0 : 1 }]}>
                <View style={[S.row, { flex: 1, alignItems: 'center', gap: 6 }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                  <Text style={S.value}>{row.label}</Text>
                </View>
                <Text style={[S.valueBold, { width: 60, textAlign: 'right' }]}>{row.count}</Text>
                <Text style={[S.muted, { width: 60, textAlign: 'right' }]}>
                  {data.totalCalls > 0 ? Math.round((row.count / data.totalCalls) * 100) : 0}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Top hours */}
      {data.topHours && data.topHours.length > 0 && (
        <View style={S.section}>
          <SectionTitle title="Horas pico de llamadas" color={accent} />
          <View style={[S.row, { gap: 8, flexWrap: 'wrap' }]}>
            {data.topHours.map(({ hour, count }) => (
              <View key={hour} style={{
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#e5e7eb',
                borderRadius: 6,
                paddingVertical: 10,
                paddingHorizontal: 12,
                minWidth: 52,
                backgroundColor: `${accent}06`,
              }}>
                <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: accent, lineHeight: 1 }}>{count}</Text>
                <Text style={[S.muted, { marginTop: 4 }]}>{String(hour).padStart(2, '0')}:00</Text>
              </View>
            ))}
          </View>
        </View>
      )}

    </BrandedDoc>
  );
}
