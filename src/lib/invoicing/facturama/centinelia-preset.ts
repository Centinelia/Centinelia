// Datos fiscales de Centinelia como emisor.
//
// Se usa cuando Nala (meerkat interno) emite CFDIs a nombre de Centinelia hacia
// sus clientes. NO se usa para clientes que emiten sus propios CFDIs (esos
// vienen de organizations.invoicing_* rows).
//
// Hardcoded con opción a overridear por env vars para dev/prod si cambia algo.
// Fuente de verdad: Constancia de Situación Fiscal de Nazre (RFC AAMN951208I25).

export interface CentineliaFiscalConfig {
  rfc: string;
  regimenFiscal: string;
  razonSocial: string;
  lugarExpedicion: string;
  domicilioFiscal: string;
  emailContacto: string;
  bankName?: string;
  clabe?: string;
  cuenta?: string;
}

export function getCentineliaFiscalConfig(): CentineliaFiscalConfig {
  return {
    rfc:            process.env.CENTINELIA_RFC             ?? 'AAMN951208I25',
    regimenFiscal:  process.env.CENTINELIA_REGIMEN         ?? '612',
    razonSocial:    process.env.CENTINELIA_RAZON_SOCIAL    ?? 'NAZRE HASSAM MIGUEL ASSAD MORALES',
    lugarExpedicion:process.env.CENTINELIA_CP_EXPEDICION   ?? '64997',
    domicilioFiscal:process.env.CENTINELIA_DOMICILIO       ?? 'Brisas del Vergel 226 El Barro, Monterrey NL',
    emailContacto:  process.env.CENTINELIA_EMAIL_CONTACTO  ?? 'hola@centinelia.mx',
    bankName:       process.env.CENTINELIA_BANK_NAME,
    clabe:          process.env.CENTINELIA_CLABE,
    cuenta:         process.env.CENTINELIA_CUENTA,
  };
}

export function getFacturamaCredentials(): { usuario: string; password: string } {
  const usuario = process.env.FACTURAMA_USER;
  const password = process.env.FACTURAMA_PASSWORD;
  if (!usuario || !password) {
    throw new Error('FACTURAMA_USER / FACTURAMA_PASSWORD no configurados en .env');
  }
  return { usuario, password };
}

export function isFacturamaSandbox(): boolean {
  return process.env.FACTURAMA_TEST_MODE === 'true';
}
