import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, DataCard, InfoRow, SectionTitle, S, todayStr, folio } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

const STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo', en_proceso: 'En proceso', listo: 'Listo',
  entregado: 'Entregado', cancelado: 'Cancelado',
};
const STATUS_COLORS: Record<string, string> = {
  nuevo: '#6C3BFF', en_proceso: '#3b82f6', listo: '#f59e0b',
  entregado: '#22c55e', cancelado: '#6b7280',
};

export interface OrdenData {
  id:         string;
  nombre?:    string | null;
  telefono?:  string | null;
  items:      string;
  tipo?:      string | null;
  direccion?: string | null;
  notas?:     string | null;
  status?:    string | null;
  created_at: string;
}

export function OrdenPdf({ brand, orden }: { brand: BrandKit; orden: OrdenData }) {
  const accent    = brand.color || '#6C3BFF';
  const status    = orden.status ?? 'nuevo';
  const statusCol = STATUS_COLORS[status] ?? '#6b7280';
  const dateStr   = new Date(orden.created_at).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <BrandedDoc brand={brand} docType="Orden de Compra" subtitle={`${dateStr}`}>

      {/* Header row */}
      <View style={[S.row, { marginBottom: 20, justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View>
          <Text style={[S.label, { marginBottom: 2 }]}>Folio</Text>
          <Text style={[S.valueBold, { fontSize: 13 }]}>{folio('ORD')}</Text>
          <Text style={[S.muted, { marginTop: 2 }]}>{dateStr}</Text>
        </View>
        <View style={[{ backgroundColor: `${statusCol}18`, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 12 }]}>
          <Text style={{ color: statusCol, fontFamily: 'Helvetica-Bold', fontSize: 10 }}>
            {STATUS_LABELS[status] ?? status}
          </Text>
        </View>
      </View>

      {/* Client */}
      <View style={S.section}>
        <SectionTitle title="Datos del cliente" color={accent} />
        <DataCard>
          <InfoRow label="Nombre"    value={orden.nombre   ?? 'No especificado'} />
          <InfoRow label="Teléfono"  value={orden.telefono ?? ''} />
          <InfoRow label="Entrega"   value={orden.direccion ?? ''} />
          <InfoRow label="Tipo"      value={orden.tipo ?? ''} />
        </DataCard>
      </View>

      {/* Items */}
      <View style={S.section}>
        <SectionTitle title="Detalle del pedido" color={accent} />
        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 14 }}>
          <Text style={[S.value, { lineHeight: 1.8 }]}>{orden.items || 'Sin detalles'}</Text>
        </View>
      </View>

      {/* Notes */}
      {orden.notas && (
        <View style={S.section}>
          <SectionTitle title="Notas" />
          <Text style={[S.value, { lineHeight: 1.7 }]}>{orden.notas}</Text>
        </View>
      )}

      {/* Signature */}
      <View style={[S.row, { marginTop: 40, gap: 40 }]}>
        <View style={{ flex: 1 }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', paddingTop: 6 }}>
            <Text style={S.muted}>Recibido por</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', paddingTop: 6 }}>
            <Text style={S.muted}>Autorizado por — {brand.businessName}</Text>
          </View>
        </View>
      </View>

    </BrandedDoc>
  );
}
