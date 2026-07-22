import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, SectionTitle, S, todayStr, folio } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

export interface FacturaItem {
  descripcion:    string;
  cantidad:       number;
  precioUnitario: number;
}

export interface FacturaData {
  clienteNombre:    string;
  clienteRFC?:      string | null;
  clienteEmail?:    string | null;
  items:            FacturaItem[];
  incluirIVA?:      boolean;
  condicionesPago?: string | null;
  notas?:           string | null;
  emisorRFC?:       string | null;
  emisorDireccion?: string | null;
  folioNum?:        string;
}

function mxn(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export function FacturaPdf({ brand, data }: { brand: BrandKit; data: FacturaData }) {
  const accent     = brand.color || '#6C3BFF';
  const num        = data.folioNum ?? folio('FAC');
  const incluirIVA = data.incluirIVA !== false;

  const subtotal = data.items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);
  const iva      = incluirIVA ? subtotal * 0.16 : 0;
  const total    = subtotal + iva;

  return (
    <BrandedDoc brand={brand} docType="Factura" subtitle={`${num} · ${todayStr()}`}>

      {/* Emisor / Receptor */}
      <View style={[S.row, { marginBottom: 20, gap: 16 }]}>
        <View style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 12 }}>
          <SectionTitle title="Emisor" color={accent} />
          <Text style={S.valueBold}>{brand.businessName}</Text>
          {data.emisorRFC && (
            <Text style={[S.muted, { marginTop: 3 }]}>RFC: {data.emisorRFC}</Text>
          )}
          {(data.emisorDireccion ?? brand.address) && (
            <Text style={[S.muted, { marginTop: 3 }]}>{data.emisorDireccion ?? brand.address}</Text>
          )}
          {brand.phone && (
            <Text style={[S.muted, { marginTop: 3 }]}>{brand.phone}</Text>
          )}
        </View>

        <View style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 12 }}>
          <SectionTitle title="Receptor" color={accent} />
          <Text style={S.valueBold}>{data.clienteNombre}</Text>
          {data.clienteRFC && (
            <Text style={[S.muted, { marginTop: 3 }]}>RFC: {data.clienteRFC}</Text>
          )}
          {data.clienteEmail && (
            <Text style={[S.muted, { marginTop: 3 }]}>{data.clienteEmail}</Text>
          )}
        </View>
      </View>

      {/* Conceptos */}
      <View style={[S.section, { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }]}>
        <View style={[S.tableHead, { backgroundColor: `${accent}0F` }]}>
          <Text style={[S.label, { flex: 1, marginBottom: 0 }]}>Descripcion</Text>
          <Text style={[S.label, { width: 44, textAlign: 'center', marginBottom: 0 }]}>Cant.</Text>
          <Text style={[S.label, { width: 92, textAlign: 'right', marginBottom: 0 }]}>P. Unit.</Text>
          <Text style={[S.label, { width: 92, textAlign: 'right', marginBottom: 0 }]}>Importe</Text>
        </View>
        {data.items.map((item, i) => (
          <View
            key={i}
            style={[S.tableRow, i === data.items.length - 1 ? { borderBottomWidth: 0 } : {}]}
          >
            <Text style={[S.value, { flex: 1 }]}>{item.descripcion}</Text>
            <Text style={[S.value, { width: 44, textAlign: 'center' }]}>{item.cantidad}</Text>
            <Text style={[S.value, { width: 92, textAlign: 'right' }]}>{mxn(item.precioUnitario)}</Text>
            <Text style={[S.value, { width: 92, textAlign: 'right' }]}>{mxn(item.cantidad * item.precioUnitario)}</Text>
          </View>
        ))}
      </View>

      {/* Totales */}
      <View style={[S.row, { justifyContent: 'flex-end', marginBottom: 20 }]}>
        <View style={{ width: 248 }}>
          <View style={[S.row, { justifyContent: 'space-between', paddingVertical: 4 }]}>
            <Text style={S.muted}>Subtotal</Text>
            <Text style={S.value}>{mxn(subtotal)}</Text>
          </View>
          {incluirIVA && (
            <View style={[S.row, { justifyContent: 'space-between', paddingVertical: 4 }]}>
              <Text style={S.muted}>IVA 16%</Text>
              <Text style={S.value}>{mxn(iva)}</Text>
            </View>
          )}
          <View style={[S.divider, { marginVertical: 6 }]} />
          <View style={[S.row, { justifyContent: 'space-between', paddingVertical: 4, alignItems: 'flex-end' }]}>
            <Text style={[S.valueBold, { fontSize: 12 }]}>Total</Text>
            <Text style={{ fontSize: 17, fontFamily: 'Helvetica-Bold', color: accent }}>{mxn(total)}</Text>
          </View>
        </View>
      </View>

      {/* Condiciones de pago */}
      {data.condicionesPago && (
        <View style={[S.section, { backgroundColor: '#f9fafb', borderRadius: 6, padding: 12 }]}>
          <SectionTitle title="Condiciones de pago" />
          <Text style={S.value}>{data.condicionesPago}</Text>
        </View>
      )}

      {/* Notas */}
      {data.notas && (
        <View style={[S.section, { marginTop: 8 }]}>
          <SectionTitle title="Notas" />
          <Text style={[S.value, { lineHeight: 1.7 }]}>{data.notas}</Text>
        </View>
      )}

      {/* Firmas */}
      <View style={[S.row, { marginTop: 36, gap: 40 }]}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', width: '100%', paddingTop: 6 }}>
            <Text style={S.muted}>Firma del emisor</Text>
            <Text style={[S.value, { marginTop: 2 }]}>{brand.businessName}</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', width: '100%', paddingTop: 6 }}>
            <Text style={S.muted}>Firma del receptor</Text>
            <Text style={[S.value, { marginTop: 2 }]}>{data.clienteNombre}</Text>
          </View>
        </View>
      </View>

    </BrandedDoc>
  );
}
