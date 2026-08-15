export function isInvoicingDisabled(): boolean {
  const v = process.env.INVOICING_DISABLED;
  return v === 'true' || v === '1';
}

export function assertInvoicingEnabled(): void {
  if (isInvoicingDisabled()) throw new Error('INVOICING_DISABLED — timbrado deshabilitado por plataforma');
}
