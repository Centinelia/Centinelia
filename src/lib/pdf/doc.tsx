import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { BrandKit } from '@/lib/brand/kit';

export type { BrandKit as PdfBrand };

// ── Base styles ───────────────────────────────────────────────────────────────

export const S = StyleSheet.create({
  page:      { paddingTop: 44, paddingBottom: 72, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 10, color: '#1A0A3B', lineHeight: 1.5 },
  row:       { flexDirection: 'row' },
  spaceBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  col:       { flexDirection: 'column' },
  section:   { marginBottom: 20 },
  label:     { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 },
  value:     { fontSize: 10, color: '#1A0A3B' },
  valueBold: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1A0A3B' },
  muted:     { fontSize: 9, color: '#9ca3af' },
  divider:   { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginVertical: 12 },
  badge:     { borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tableHead: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f3f4f6' },
  tableRow:  { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  footer:    { position: 'absolute', bottom: 28, left: 44, right: 44 },
});

// ── Shared BrandedDoc shell ───────────────────────────────────────────────────

export function BrandedDoc({ brand, docType, subtitle, children, filename }: {
  brand:    BrandKit;
  docType:  string;
  subtitle: string;
  children: React.ReactNode;
  filename?: string;
}) {
  const accent = brand.color || '#6C3BFF';

  const footerParts = [
    brand.footerText,
    brand.phone,
    brand.address,
    brand.website,
  ].filter(Boolean);

  return (
    <Document title={`${docType} — ${brand.businessName}`} author={brand.businessName}>
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={[S.spaceBetween, { marginBottom: 24, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: accent }]}>
          <View>
            {brand.logoUrl
              ? <Image src={brand.logoUrl} style={{ height: 34, maxWidth: 140 }} />
              : <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold' }}>{brand.businessName}</Text>
            }
            {brand.logoUrl && (
              <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 3 }}>{brand.businessName}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: accent }}>{docType}</Text>
            <Text style={[S.muted, { marginTop: 2 }]}>{subtitle}</Text>
          </View>
        </View>

        {/* ── Content ── */}
        {children}

        {/* ── Footer ── */}
        <View style={[S.footer, { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 }]}>
          <View style={S.spaceBetween}>
            <Text style={{ fontSize: 8, color: '#9ca3af' }}>
              {footerParts.join('  ·  ')}
            </Text>
            <Text style={{ fontSize: 8, color: '#d1d5db' }}>Generado por Centinelia</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

export function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <View style={[S.row, { marginBottom: 6, gap: 0 }]}>
      <Text style={[S.label, { width: 100, marginBottom: 0, paddingTop: 1 }]}>{label}</Text>
      <Text style={[S.value, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

export function SectionTitle({ title, color }: { title: string; color?: string }) {
  return (
    <Text style={[S.label, { color: color ?? '#6b7280', marginBottom: 8 }]}>{title}</Text>
  );
}

export function DataCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 14, marginBottom: 14 }}>
      {children}
    </View>
  );
}

export function OutcomeBadge({ outcome, color }: { outcome: string; color: string }) {
  const labels: Record<string, string> = {
    lead_created: 'Lead', appointment_booked: 'Cita agendada', order_taken: 'Pedido',
    transferred: 'Transferida', info_provided: 'Información', other: 'Completada',
  };
  return (
    <View style={[S.badge, { backgroundColor: `${color}18` }]}>
      <Text style={{ color, fontFamily: 'Helvetica-Bold', fontSize: 9 }}>{labels[outcome] ?? outcome}</Text>
    </View>
  );
}

export function todayStr() {
  return new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function folio(prefix: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${Math.floor(Math.random()*9000)+1000}`;
}
