import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, DataCard, InfoRow, OutcomeBadge, SectionTitle, S, todayStr } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

const OUTCOME_COLORS: Record<string, string> = {
  lead_created: '#6C3BFF', appointment_booked: '#3b82f6', order_taken: '#f59e0b',
  transferred: '#a855f7', info_provided: '#6b7280', other: '#9ca3af',
};

export interface LlamadaData {
  caller_number:      string | null;
  outcome:            string;
  duration_seconds:   number;
  created_at:         string;
  summary:            string | null;
  transcript:         string | null;
  acciones_pendientes: string | null;
  nivel_interes:      string | null;
  clientName?:        string | null;
}

export function LlamadaPdf({ brand, call }: { brand: BrandKit; call: LlamadaData }) {
  const accent   = brand.color || '#6C3BFF';
  const color    = OUTCOME_COLORS[call.outcome] ?? '#9ca3af';
  const duration = Math.max(1, Math.ceil(call.duration_seconds / 60));
  const dateStr  = new Date(call.created_at).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <BrandedDoc brand={brand} docType="Resumen de Llamada" subtitle={dateStr}>

      {/* Metadata */}
      <DataCard>
        <View style={[S.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <InfoRow label="Teléfono"  value={call.caller_number ?? 'No disponible'} />
            {call.clientName && <InfoRow label="Cliente" value={call.clientName} />}
            <InfoRow label="Duración"  value={`${duration} ${duration === 1 ? 'minuto' : 'minutos'}`} />
            <InfoRow label="Fecha"     value={dateStr} />
            {call.nivel_interes && <InfoRow label="Nivel de interés" value={
              call.nivel_interes === 'alto' ? 'Alto' : call.nivel_interes === 'medio' ? 'Medio' : 'Bajo'
            } />}
          </View>
          <OutcomeBadge outcome={call.outcome} color={color} />
        </View>
      </DataCard>

      {/* Summary */}
      {call.summary && (
        <View style={S.section}>
          <SectionTitle title="Resumen de la llamada" color={accent} />
          <View style={{ borderLeftWidth: 3, borderLeftColor: accent, paddingLeft: 12 }}>
            <Text style={[S.value, { lineHeight: 1.7 }]}>{call.summary}</Text>
          </View>
        </View>
      )}

      {/* Pending actions */}
      {call.acciones_pendientes && (
        <View style={[S.section, { backgroundColor: `${accent}0A`, borderRadius: 6, padding: 14 }]}>
          <SectionTitle title="Acción pendiente" color={accent} />
          <Text style={S.value}>{call.acciones_pendientes}</Text>
        </View>
      )}

      {/* Transcript (truncated) */}
      {call.transcript && (
        <View style={S.section}>
          <SectionTitle title="Transcripción" />
          <Text style={[S.muted, { lineHeight: 1.7 }]}>
            {call.transcript.length > 2500
              ? call.transcript.slice(0, 2500) + '\n\n[Transcripción truncada...]'
              : call.transcript}
          </Text>
        </View>
      )}

    </BrandedDoc>
  );
}
