/**
 * Catálogos SAT usados en el flujo de solicitud de factura.
 * Solo los códigos más comunes que un cliente normal podría pedir.
 * Los códigos exhaustivos los maneja el PAC (Solución Factible, etc.) al timbrar.
 */

export const USO_CFDI: Record<string, string> = {
  G01: 'Adquisición de mercancías',
  G02: 'Devoluciones, descuentos o bonificaciones',
  G03: 'Gastos en general',
  I01: 'Construcciones',
  I02: 'Mobiliario y equipo de oficina por inversiones',
  I03: 'Equipo de transporte',
  I04: 'Equipo de cómputo y accesorios',
  I05: 'Dados, troqueles, moldes, matrices y herramental',
  I06: 'Comunicaciones telefónicas',
  I07: 'Comunicaciones satelitales',
  I08: 'Otra maquinaria y equipo',
  D01: 'Honorarios médicos, dentales y gastos hospitalarios',
  D02: 'Gastos médicos por incapacidad o discapacidad',
  D03: 'Gastos funerales',
  D04: 'Donativos',
  D05: 'Intereses reales efectivamente pagados por créditos hipotecarios',
  D06: 'Aportaciones voluntarias al SAR',
  D07: 'Primas por seguros de gastos médicos',
  D08: 'Gastos de transportación escolar obligatoria',
  D09: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones',
  D10: 'Pagos por servicios educativos (colegiaturas)',
  S01: 'Sin efectos fiscales',
  CP01: 'Pagos',
  CN01: 'Nómina',
};

export const FORMA_PAGO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito',
  '05': 'Monedero electrónico',
  '06': 'Dinero electrónico',
  '08': 'Vales de despensa',
  '12': 'Dación en pago',
  '13': 'Pago por subrogación',
  '14': 'Pago por consignación',
  '15': 'Condonación',
  '17': 'Compensación',
  '23': 'Novación',
  '24': 'Confusión',
  '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad',
  '27': 'A satisfacción del acreedor',
  '28': 'Tarjeta de débito',
  '29': 'Tarjeta de servicios',
  '30': 'Aplicación de anticipos',
  '31': 'Intermediario pagos',
  '99': 'Por definir',
};

export const METODO_PAGO: Record<string, string> = {
  PUE: 'Pago en una sola exhibición',
  PPD: 'Pago en parcialidades o diferido',
};

/**
 * Validación de RFC MX. Acepta persona física (13 chars) o moral (12 chars).
 * Formato oficial SAT:
 *  - Persona moral: [A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}       → 12 chars
 *  - Persona física: [A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}      → 13 chars
 * También acepta RFC genérico XAXX010101000 (extranjeros) y XEXX010101000 (residentes extranjero).
 */
const RFC_RE = /^([A-ZÑ&]{3,4})([0-9]{2})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([A-Z0-9]{2}[0-9A])$/;

export function isValidRfc(rfc: string): boolean {
  const clean = rfc.toUpperCase().replace(/[\s-]/g, '');
  if (clean === 'XAXX010101000' || clean === 'XEXX010101000') return true;
  return RFC_RE.test(clean);
}

export function normalizeRfc(rfc: string): string {
  return rfc.toUpperCase().replace(/[\s-]/g, '');
}

export function usoCfdiLabel(code: string): string {
  const upper = code.toUpperCase();
  return USO_CFDI[upper] ?? code;
}

export function formaPagoLabel(code: string): string {
  const padded = code.padStart(2, '0');
  return FORMA_PAGO[padded] ?? code;
}

export function metodoPagoLabel(code: string): string {
  const upper = code.toUpperCase();
  return METODO_PAGO[upper] ?? code;
}
