// SOAP client para InvoiceOne EasyOne (PAC autorizado SAT).
//
// Documentación de InvoiceOne vive en ayuda.invoiceone.com.mx detrás de KB
// dinámico que no es scraping-friendly. Cuando pidamos sandbox a InvoiceOne
// nos mandarán el WSDL real. Los namespaces y URLs marcados como TODO abajo
// se plugean con el WSDL real; el resto del adapter no cambia.
//
// Método principal reportado en su marketing: SOAP timbrado con auth
// usuario/password en el body. Métodos test se llaman ObtenerCFDIPrueba /
// ObtenerTFDPrueba; prod ObtenerCFDI / ObtenerTFD.

const XML_ESC = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// TODO(InvoiceOne WSDL): confirmar namespaces reales al recibir credenciales
// sandbox. Los tentativos siguen el patrón típico de PACs mexicanos SOAP.
const NS_TIMBRADO    = 'http://timbrado.ws.cfdi.invoiceone.com';
const NS_CANCELACION = 'http://cancelacion.ws.cfdi.invoiceone.com';

export interface InvoiceOneEndpoints {
  timbrado:    { test: string; prod: string };
  cancelacion: { test: string; prod: string };
}

// TODO(InvoiceOne WSDL): confirmar URLs reales al recibir credenciales.
export const DEFAULT_ENDPOINTS: InvoiceOneEndpoints = {
  timbrado: {
    test: process.env.INVOICEONE_TIMBRADO_TEST_URL ?? 'https://ws.pruebas.invoiceone.com.mx/timbrado.asmx',
    prod: process.env.INVOICEONE_TIMBRADO_PROD_URL ?? 'https://ws.invoiceone.com.mx/timbrado.asmx',
  },
  cancelacion: {
    test: process.env.INVOICEONE_CANCELACION_TEST_URL ?? 'https://ws.pruebas.invoiceone.com.mx/cancelacion.asmx',
    prod: process.env.INVOICEONE_CANCELACION_PROD_URL ?? 'https://ws.invoiceone.com.mx/cancelacion.asmx',
  },
};

export function buildTimbrarEnvelope(usuario: string, password: string, cfdiSignedXml: string, testMode: boolean): string {
  const b64 = Buffer.from(cfdiSignedXml, 'utf8').toString('base64');
  const method = testMode ? 'ObtenerCFDIPrueba' : 'ObtenerCFDI';
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${NS_TIMBRADO}">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:${method}>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <xmlComprobanteB64>${b64}</xmlComprobanteB64>
    </ser:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function buildCancelarEnvelope(
  usuario: string, password: string,
  uuid: string, motivo: '01' | '02' | '03' | '04', uuidSustituto: string | null,
  testMode: boolean,
): string {
  const sust = uuidSustituto
    ? `      <uuidSustituto>${XML_ESC(uuidSustituto)}</uuidSustituto>\n`
    : '';
  const method = testMode ? 'CancelarCFDIPrueba' : 'CancelarCFDI';
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${NS_CANCELACION}">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:${method}>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <uuid>${XML_ESC(uuid)}</uuid>
      <motivo>${motivo}</motivo>
${sust}    </ser:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function buildConsultarEstatusEnvelope(usuario: string, password: string, uuid: string, testMode: boolean): string {
  const method = testMode ? 'ConsultarEstatusCancelacionPrueba' : 'ConsultarEstatusCancelacion';
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="${NS_CANCELACION}">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:${method}>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <uuid>${XML_ESC(uuid)}</uuid>
    </ser:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export async function soapCall(
  url: string, action: string, body: string, timeoutMs = 30000,
): Promise<{ status: number; xml: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        'SOAPAction':   action,
      },
      body,
      signal: ctrl.signal,
    });
    const xml = await res.text();
    return { status: res.status, xml };
  } finally {
    clearTimeout(t);
  }
}
