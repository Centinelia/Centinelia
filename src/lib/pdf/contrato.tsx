import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, SectionTitle, S, todayStr, folio } from './doc';
import type { BrandKit } from '@/lib/brand/kit';

export interface ContratoData {
  clientName?:  string;
  clientRfc?:   string;
  clientEmail?: string;
  clientPhone?: string;
  services:     string;
  monto?:       string;
  vigencia?:    string;
}

function Clause({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[S.valueBold, { marginBottom: 3 }]}>CLÁUSULA {num}. {title.toUpperCase()}</Text>
      <Text style={[S.value, { lineHeight: 1.8 }]}>{body}</Text>
    </View>
  );
}

export function ContratoPdf({ brand, data }: { brand: BrandKit; data: ContratoData }) {
  const accent = brand.color || '#6C3BFF';
  const num    = folio('CONT');
  const today  = todayStr();

  return (
    <BrandedDoc brand={brand} docType="Contrato de Servicios" subtitle={`${num} · ${today}`}>

      {/* Intro */}
      <View style={[S.section, { backgroundColor: `${accent}08`, borderRadius: 6, padding: 12 }]}>
        <Text style={[S.value, { lineHeight: 1.8 }]}>
          {`En la ciudad, a ${today}, por un lado `}
          <Text style={S.valueBold}>{brand.businessName.toUpperCase()}</Text>
          {` (en adelante EL PRESTADOR) y por otro lado `}
          <Text style={S.valueBold}>{data.clientName?.toUpperCase() ?? 'EL CLIENTE'}</Text>
          {`, acuerdan celebrar el presente Contrato de Prestación de Servicios al tenor de las siguientes cláusulas:`}
        </Text>
      </View>

      {/* Parties */}
      <View style={[S.section, S.row, { gap: 16 }]}>
        <View style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 12 }}>
          <SectionTitle title="El Prestador" color={accent} />
          <Text style={S.valueBold}>{brand.businessName}</Text>
          {brand.phone    && <Text style={[S.value, { marginTop: 3 }]}>Tel: {brand.phone}</Text>}
          {brand.address  && <Text style={[S.value, { marginTop: 2 }]}>{brand.address}</Text>}
          {brand.website  && <Text style={[S.muted, { marginTop: 2 }]}>{brand.website}</Text>}
        </View>
        <View style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 12 }}>
          <SectionTitle title="El Cliente" color={accent} />
          <Text style={S.valueBold}>{data.clientName ?? '_______________'}</Text>
          {data.clientRfc   && <Text style={[S.value, { marginTop: 3 }]}>RFC: {data.clientRfc}</Text>}
          {data.clientPhone && <Text style={[S.value, { marginTop: 2 }]}>Tel: {data.clientPhone}</Text>}
          {data.clientEmail && <Text style={[S.value, { marginTop: 2 }]}>{data.clientEmail}</Text>}
        </View>
      </View>

      {/* Clauses */}
      <Clause
        num="PRIMERA"
        title="Objeto del contrato"
        body={`EL PRESTADOR se obliga a prestar los siguientes servicios a EL CLIENTE:\n\n${data.services}`}
      />
      <Clause
        num="SEGUNDA"
        title="Vigencia"
        body={data.vigencia
          ? `El presente contrato tendrá una vigencia de ${data.vigencia} a partir de la firma del mismo.`
          : `El presente contrato tendrá vigencia indefinida y podrá ser rescindido por cualquiera de las partes con 30 días naturales de anticipación mediante aviso por escrito.`
        }
      />
      <Clause
        num="TERCERA"
        title="Contraprestación"
        body={data.monto
          ? `EL CLIENTE se obliga a pagar a EL PRESTADOR la cantidad de ${data.monto} por los servicios pactados en la Cláusula Primera, conforme a la forma de pago acordada.`
          : `EL CLIENTE se obliga a pagar a EL PRESTADOR la cantidad acordada por los servicios pactados en la Cláusula Primera, en los términos y plazos convenidos entre las partes.`
        }
      />
      <Clause
        num="CUARTA"
        title="Confidencialidad"
        body="Ambas partes se obligan a mantener confidencialidad sobre la información que se intercambie con motivo del presente contrato, y no divulgarla a terceros sin previa autorización escrita de la parte que la proporcionó."
      />
      <Clause
        num="QUINTA"
        title="Jurisdicción"
        body="Para todo lo relativo a la interpretación y cumplimiento del presente contrato, las partes se someten a la jurisdicción de los tribunales competentes, renunciando a cualquier otro fuero que pudiera corresponderles."
      />

      {/* Signatures */}
      <View style={[S.row, { marginTop: 36, gap: 40 }]}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', width: '100%', paddingTop: 6 }}>
            <Text style={S.muted}>EL PRESTADOR</Text>
            <Text style={[S.value, { marginTop: 2 }]}>{brand.businessName}</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ borderTopWidth: 1, borderTopColor: '#1A0A3B', width: '100%', paddingTop: 6 }}>
            <Text style={S.muted}>EL CLIENTE</Text>
            <Text style={[S.value, { marginTop: 2 }]}>{data.clientName ?? '_______________'}</Text>
          </View>
        </View>
      </View>

    </BrandedDoc>
  );
}
