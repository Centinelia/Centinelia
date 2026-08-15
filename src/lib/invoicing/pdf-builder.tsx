// src/lib/invoicing/pdf-builder.tsx
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica' },
  h1: { fontSize: 14, fontWeight: 'bold', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  section: { marginTop: 8, padding: 6, border: '1 solid #ddd' },
  label: { color: '#666', fontSize: 8 },
  qr: { width: 90, height: 90 },
  small: { fontSize: 7, color: '#333', marginTop: 4 },
});

export interface CfdiPdfInput {
  emisor: { rfc: string; nombre: string; regimenFiscal: string };
  receptor: { rfc: string; nombre: string; usoCfdi: string };
  conceptos: Array<{ descripcion: string; cantidad: number; valorUnitario: number; importe: number }>;
  subtotal: number; iva: number; total: number;
  uuid: string; selloSat: string; certificadoSat: string;
  fechaTimbrado: string; cadenaOriginal: string; qrPng: Buffer;
  folio?: string; serie?: string;
}

const mxn = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

function Doc({ d }: { d: CfdiPdfInput }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>CFDI · Ingreso · v4.0</Text>
        <View style={s.row}>
          <Text><Text style={s.label}>Emisor: </Text>{d.emisor.rfc} · {d.emisor.nombre}</Text>
          <Text><Text style={s.label}>Régimen: </Text>{d.emisor.regimenFiscal}</Text>
        </View>
        <View style={s.row}>
          <Text><Text style={s.label}>Receptor: </Text>{d.receptor.rfc} · {d.receptor.nombre}</Text>
          <Text><Text style={s.label}>Uso CFDI: </Text>{d.receptor.usoCfdi}</Text>
        </View>
        <View style={s.section}>
          {d.conceptos.map((c, i) => (
            <View key={i} style={s.row}>
              <Text>{c.cantidad} × {c.descripcion}</Text>
              <Text>{mxn(c.importe)}</Text>
            </View>
          ))}
        </View>
        <View style={s.row}><Text>Subtotal</Text><Text>{mxn(d.subtotal)}</Text></View>
        <View style={s.row}><Text>IVA 16%</Text><Text>{mxn(d.iva)}</Text></View>
        <View style={s.row}><Text style={{ fontWeight: 'bold' }}>Total</Text><Text style={{ fontWeight: 'bold' }}>{mxn(d.total)}</Text></View>

        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Image src={d.qrPng} style={s.qr} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={s.label}>Folio Fiscal (UUID)</Text>
            <Text>{d.uuid}</Text>
            <Text style={s.label}>Fecha de timbrado</Text>
            <Text>{d.fechaTimbrado}</Text>
            <Text style={s.label}>No. Serie Cert. SAT</Text>
            <Text>{d.certificadoSat}</Text>
          </View>
        </View>

        <Text style={s.label}>Sello CFDI</Text>
        <Text style={s.small}>{d.selloSat}</Text>
        <Text style={s.label}>Cadena original del complemento de certificación</Text>
        <Text style={s.small}>{d.cadenaOriginal}</Text>
      </Page>
    </Document>
  );
}

export async function buildCfdiPdf(d: CfdiPdfInput): Promise<Buffer> {
  // @react-pdf/renderer's toBuffer() returns a NodeJS Readable stream, not a Buffer.
  // Collect chunks into a real Buffer for Storage upload + email attachments.
  const stream = (await pdf(<Doc d={d} />).toBuffer()) as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
  }
  return Buffer.concat(chunks);
}
