const XML_ESC = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function buildTimbrarEnvelope(usuario: string, password: string, cfdiXml: string): string {
  const b64 = Buffer.from(cfdiXml, 'utf8').toString('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.web.mx/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:timbrarBase64>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <cfdi>${b64}</cfdi>
      <zip>false</zip>
    </ser:timbrarBase64>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function buildCancelarEnvelope(
  usuario: string, password: string,
  uuid: string, motivo: '01'|'02'|'03'|'04', uuidSustituto: string | null,
): string {
  const sust = uuidSustituto
    ? `      <uuidSustituto>${XML_ESC(uuidSustituto)}</uuidSustituto>\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.web.mx/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:cancelarAsincrono>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <uuid>${XML_ESC(uuid)}</uuid>
      <motivo>${motivo}</motivo>
${sust}    </ser:cancelarAsincrono>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function buildConsultarEstatusEnvelope(usuario: string, password: string, uuid: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.web.mx/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:getStatusCancelacionAsincrona>
      <usuario>${XML_ESC(usuario)}</usuario>
      <password>${XML_ESC(password)}</password>
      <uuid>${XML_ESC(uuid)}</uuid>
    </ser:getStatusCancelacionAsincrona>
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
        'SOAPAction': action,
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
