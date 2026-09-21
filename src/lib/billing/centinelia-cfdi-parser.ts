/**
 * Parser de CFDI 4.0 XML. Extrae los campos que necesita Neka para registrar
 * una factura emitida (o recibida) en el repositorio: UUID fiscal, fechas,
 * emisor, receptor, importes, forma/metodo de pago.
 *
 * Sin dependencias externas — regex sobre atributos XML. El SAT emite XMLs
 * consistentes y auto-cerrados; los atributos vienen todos en la etiqueta de
 * apertura del Comprobante. Esto no es un parser XML generico, es un
 * extractor de atributos conocidos.
 */

export interface CfdiParsed {
  uuid:             string;
  fechaEmision:     string;
  fechaTimbrado:    string;
  tipoComprobante:  'I' | 'E' | 'P' | 'N' | 'T';
  serie?:           string;
  folio?:           string;
  metodoPago:       'PUE' | 'PPD' | null;
  formaPago:        string;
  moneda:           string;
  lugarExpedicion:  string;
  subtotal:         number;
  iva:              number;
  total:            number;
  emisor: {
    rfc:            string;
    nombre:         string;
    regimenFiscal:  string;
  };
  receptor: {
    rfc:             string;
    nombre:          string;
    usoCfdi:         string;
    regimenFiscal:   string;
    domicilioFiscal: string;
  };
}

export type ParseResult =
  | { ok: true; data: CfdiParsed }
  | { ok: false; error: string };

function attr(xml: string, tagPattern: RegExp, attribute: string): string | undefined {
  const tag = xml.match(tagPattern)?.[0];
  if (!tag) return undefined;
  const m = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*"([^"]*)"`));
  return m?.[1];
}

export function parseCfdiXml(xml: string): ParseResult {
  if (!xml || xml.trim().length === 0) {
    return { ok: false, error: 'XML vacio' };
  }

  const comprobanteTag = xml.match(/<cfdi:Comprobante\b[^>]*>/);
  if (!comprobanteTag) {
    return { ok: false, error: 'No se encontro tag cfdi:Comprobante' };
  }

  const tipo = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'TipoDeComprobante');
  if (!tipo || !['I', 'E', 'P', 'N', 'T'].includes(tipo)) {
    return { ok: false, error: `TipoDeComprobante invalido o ausente: ${tipo}` };
  }

  const fechaEmision = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'Fecha');
  if (!fechaEmision) return { ok: false, error: 'Fecha de emision ausente' };

  const subtotalStr = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'SubTotal');
  const totalStr    = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'Total');
  if (!subtotalStr || !totalStr) {
    return { ok: false, error: 'SubTotal o Total ausente en Comprobante' };
  }

  const metodoPagoRaw = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'MetodoPago');
  const metodoPago: 'PUE' | 'PPD' | null =
    metodoPagoRaw === 'PUE' || metodoPagoRaw === 'PPD' ? metodoPagoRaw : null;

  const formaPago       = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'FormaPago') ?? '';
  const moneda          = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'Moneda') ?? 'MXN';
  const lugarExpedicion = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'LugarExpedicion') ?? '';
  const serie           = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'Serie');
  const folio           = attr(xml, /<cfdi:Comprobante\b[^>]*>/, 'Folio');

  const emisorTagRegex = /<cfdi:Emisor\b[^>]*\/?>/;
  const emisorTag = xml.match(emisorTagRegex);
  if (!emisorTag) return { ok: false, error: 'Emisor ausente' };
  const emisor = {
    rfc:           attr(xml, emisorTagRegex, 'Rfc') ?? '',
    nombre:        attr(xml, emisorTagRegex, 'Nombre') ?? '',
    regimenFiscal: attr(xml, emisorTagRegex, 'RegimenFiscal') ?? '',
  };
  if (!emisor.rfc) return { ok: false, error: 'RFC del emisor ausente' };

  const receptorTagRegex = /<cfdi:Receptor\b[^>]*\/?>/;
  const receptorTag = xml.match(receptorTagRegex);
  if (!receptorTag) return { ok: false, error: 'Receptor ausente' };
  const receptor = {
    rfc:             attr(xml, receptorTagRegex, 'Rfc') ?? '',
    nombre:          attr(xml, receptorTagRegex, 'Nombre') ?? '',
    usoCfdi:         attr(xml, receptorTagRegex, 'UsoCFDI') ?? '',
    regimenFiscal:   attr(xml, receptorTagRegex, 'RegimenFiscalReceptor') ?? '',
    domicilioFiscal: attr(xml, receptorTagRegex, 'DomicilioFiscalReceptor') ?? '',
  };
  if (!receptor.rfc) return { ok: false, error: 'RFC del receptor ausente' };

  const timbreTagRegex = /<tfd:TimbreFiscalDigital\b[^>]*\/?>/;
  const timbreTag = xml.match(timbreTagRegex);
  if (!timbreTag) {
    return { ok: false, error: 'CFDI sin timbrado (TimbreFiscalDigital ausente) — UUID no disponible' };
  }
  const uuid          = attr(xml, timbreTagRegex, 'UUID');
  const fechaTimbrado = attr(xml, timbreTagRegex, 'FechaTimbrado');
  if (!uuid) return { ok: false, error: 'UUID ausente en TimbreFiscalDigital' };

  const impuestosTagRegex = /<cfdi:Impuestos\b[^>]*TotalImpuestosTrasladados="([^"]*)"[^>]*>/;
  const ivaMatch = xml.match(impuestosTagRegex);
  const iva = ivaMatch ? parseFloat(ivaMatch[1]) : 0;

  return {
    ok: true,
    data: {
      uuid:            uuid.toUpperCase(),
      fechaEmision,
      fechaTimbrado:   fechaTimbrado ?? '',
      tipoComprobante: tipo as CfdiParsed['tipoComprobante'],
      serie,
      folio,
      metodoPago,
      formaPago,
      moneda,
      lugarExpedicion,
      subtotal:        parseFloat(subtotalStr),
      iva,
      total:           parseFloat(totalStr),
      emisor,
      receptor,
    },
  };
}
