import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, DataCard, InfoRow, SectionTitle, S, todayStr, folio } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

export interface CotizacionData {
  clientName:  string | null;
  phone:       string | null;
  email:       string | null;
  servicio:    string | null;
  presupuesto: string | null;
  notas:       string | null;
}

export function CotizacionPdf({ brand, data, folioNum }: {
  brand:    BrandKit;
  data:     CotizacionData;
  folioNum?: string;
}) {
  const accent    = brand.color || '#6C3BFF';
  const num       = folioNum ?? folio('COT');
  const validDate = new Date(Date.now() + 30 * 86400000)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <BrandedDoc brand={brand} docType="Cotización" subtitle={`${num} · ${todayStr()}`}>

      {/* Meta row */}
      <View style={[S.row, { marginBottom: 20, gap: 12 }]}>
        <DataCard>
          <SectionTitle title="Folio" color={accent} />
          <Text style={[S.valueBold, { fontSize: 12 }]}>{num}</Text>
        </DataCard>
        <DataCard>
          <SectionTitle title="Fecha" color={accent} />
          <Text style={S.value}>{todayStr()}</Text>
        </DataCard>
        <DataCard>
          <SectionTitle title="Válida hasta" color={accent} />
          <Text style={S.value}>{validDate}</Text>
        </DataCard>
      </View>

      {/* Client */}
      <View style={S.section}>
        <SectionTitle title="Datos del cliente" color={accent} />
        <DataCard>
          <InfoRow label="Nombre"    value={data.clientName  ?? 'Por definir'} />
          <InfoRow label="Teléfono"  value={data.phone       ?? ''} />
          <InfoRow label="Email"     value={data.email       ?? ''} />
        </DataCard>
      </View>

      {/* Services */}
      <View style={S.section}>
        <SectionTitle title="Descripción de servicios / productos" color={accent} />
        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
          <View style={[S.tableHead, { backgroundColor: `${accent}0F` }]}>
            <Text style={[S.label, { flex: 1, marginBottom: 0 }]}>Descripción</Text>
            <Text style={[S.label, { width: 120, textAlign: 'right', marginBottom: 0 }]}>Precio est.</Text>
          </View>
          <View style={[S.tableRow, { borderBottomWidth: 0 }]}>
            <Text style={[S.value, { flex: 1 }]}>{data.servicio ?? 'Por definir'}</Text>
            <Text style={[S.valueBold, { width: 120, textAlign: 'right' }]}>
              {data.presupuesto ?? 'A convenir'}
            </Text>
          </View>
        </View>
      </View>

      {/* Total */}
      <View style={[S.row, { justifyContent: 'flex-end', marginBottom: 20 }]}>
        <View style={{ width: 220, borderWidth: 2, borderColor: accent, borderRadius: 6, padding: 12 }}>
          <View style={[S.row, { justifyContent: 'space-between' }]}>
            <Text style={S.label}>Total estimado</Text>
            <Text style={[S.valueBold, { fontSize: 14, color: accent }]}>
              {data.presupuesto ?? 'A convenir'}
            </Text>
          </View>
        </View>
      </View>

      {/* Notes */}
      {data.notas && (
        <View style={S.section}>
          <SectionTitle title="Notas adicionales" />
          <Text style={[S.value, { lineHeight: 1.7 }]}>{data.notas}</Text>
        </View>
      )}

      {/* Conditions */}
      <View style={[S.section, { backgroundColor: '#f9fafb', borderRadius: 6, padding: 12 }]}>
        <SectionTitle title="Condiciones" />
        <Text style={[S.muted, { lineHeight: 1.8 }]}>
          {'• Esta cotización es válida por 30 días naturales a partir de la fecha de emisión.\n'}
          {'• Los precios no incluyen IVA a menos que se indique expresamente.\n'}
          {'• Para aceptar esta cotización, responda a este documento o contáctenos directamente.'}
        </Text>
      </View>

      {/* Signatures */}
      <View style={[S.row, { marginTop: 32, gap: 40 }]}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', width: '100%', paddingTop: 6 }}>
            <Text style={S.muted}>Firma del prestador</Text>
            <Text style={[S.value, { marginTop: 2 }]}>{brand.businessName}</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', width: '100%', paddingTop: 6 }}>
            <Text style={S.muted}>Firma del cliente</Text>
            <Text style={[S.value, { marginTop: 2 }]}>{data.clientName ?? '_______________'}</Text>
          </View>
        </View>
      </View>

    </BrandedDoc>
  );
}
