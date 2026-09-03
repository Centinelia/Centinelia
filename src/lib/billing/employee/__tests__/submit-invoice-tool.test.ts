/**
 * submit-invoice-tool.test.ts — tests for the submit_invoice_batch tool handler.
 *
 * Verifica que:
 * 1. Happy path: adapter.getClientByRFC + getProductBySKU + submitInvoiceBatch se llaman correctamente.
 * 2. RFC inexistente → devuelve error sin llamar submitInvoiceBatch.
 * 3. SKU inexistente → devuelve error sin llamar submitInvoiceBatch.
 * 4. Cantidad <= 0 → devuelve error.
 * 5. Aplica defaults: unit_price y iva_tasa se toman del catalogo si no vienen en la línea.
 * 6. Aplica default de payment_method='efectivo' y usoCFDI del cliente si no vienen.
 * 7. Registra en billing_activity_log con severity=info al éxito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockBillingAdapter } from '../../adapters/mock';
import type { BillingClient, BillingProduct } from '../../adapter';

const mockInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: mockInsert }) }),
}));
vi.mock('@/lib/billing/storage/dropbox', () => ({
  DropboxClient: vi.fn().mockImplementation(function () { /* no-op */ }),
}));
vi.mock('@/lib/billing/storage/snapshot', () => ({
  SnapshotStorage: vi.fn().mockImplementation(function () { /* no-op */ }),
}));
vi.mock('@/lib/billing/mail/send', () => ({
  sendBillingMail: vi.fn(),
  replyToInboundEmail: vi.fn(),
}));

import { buildEmployeeTools } from '../tools';

const clientCarnes: BillingClient = {
  rfc: 'CAL051103F36',
  adapterId: '008',
  razonSocial: 'CARNES ALANIS',
  usoCFDI: 'G01',
  regimen: '612',
  codigoPostal: '64000',
};
const productoTortilla: BillingProduct = {
  sku: '021',
  nombre: 'PAQ 500 GMS TORTILLA MAIZ ESTRELLA',
  unidad: 'PZA',
  precio: 6.5,
  claveSAT: '50221300',
  ivaTasa: 0,
};

function buildToolsAgainstMockAdapter() {
  const adapter = new MockBillingAdapter({
    clients:  [clientCarnes],
    products: [productoTortilla],
  });
  const spy = vi.spyOn(adapter, 'submitInvoiceBatch');
  const tools = buildEmployeeTools({
    adapter,
    ctx: { portalEmail: 'piloto-estrella@centinelia.mx', integrationId: 'int-1' },
    emailId: 'email-abc',
    dropboxToken: 'unused',
    dropboxBasePath: '/tortilleria',
    escalationEmail: 'nazre20@gmail.com',
  });
  const submitTool = tools.find((t) => t.name === 'submit_invoice_batch');
  if (!submitTool) throw new Error('submit_invoice_batch tool not registered');
  return { submitTool, spy };
}

describe('submit_invoice_batch tool', () => {
  beforeEach(() => {
    mockInsert.mockClear();
  });

  it('happy path: builds invoice and calls adapter.submitInvoiceBatch', async () => {
    const { submitTool, spy } = buildToolsAgainstMockAdapter();

    const result = await submitTool.handler({
      client_rfc: 'CAL051103F36',
      lines: [{ sku: '021', qty: 5 }],
      payment_method: 'efectivo',
    });

    expect(result).toMatchObject({ ok: true, mode: expect.any(String) });
    expect(spy).toHaveBeenCalledOnce();
    const [invoices] = spy.mock.calls[0];
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      clientRFC: 'CAL051103F36',
      paymentMethod: 'efectivo',
      usoCFDI: 'G01',
      lines: [{ sku: '021', qty: 5, unitPrice: 6.5, ivaTasa: 0 }],
    });
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockInsert.mock.calls[0][0]).toMatchObject({
      action_type: 'invoice_submitted',
      severity: 'info',
      entity_ref: 'CAL051103F36',
    });
  });

  it('applies unit_price and iva_tasa overrides when provided', async () => {
    const { submitTool, spy } = buildToolsAgainstMockAdapter();

    await submitTool.handler({
      client_rfc: 'CAL051103F36',
      lines: [{ sku: '021', qty: 3, unit_price: 7.25, iva_tasa: 0.16 }],
    });

    const [invoices] = spy.mock.calls[0];
    expect(invoices[0].lines[0]).toMatchObject({ unitPrice: 7.25, ivaTasa: 0.16 });
  });

  it('defaults payment_method to efectivo when omitted', async () => {
    const { submitTool, spy } = buildToolsAgainstMockAdapter();

    await submitTool.handler({
      client_rfc: 'CAL051103F36',
      lines: [{ sku: '021', qty: 1 }],
    });

    const [invoices] = spy.mock.calls[0];
    expect(invoices[0].paymentMethod).toBe('efectivo');
  });

  it('returns error when RFC does not exist in catalog', async () => {
    const { submitTool, spy } = buildToolsAgainstMockAdapter();

    const result = await submitTool.handler({
      client_rfc: 'ZZZ999999XXX',
      lines: [{ sku: '021', qty: 1 }],
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('ZZZ999999XXX') });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns error when SKU does not exist in catalog', async () => {
    const { submitTool, spy } = buildToolsAgainstMockAdapter();

    const result = await submitTool.handler({
      client_rfc: 'CAL051103F36',
      lines: [{ sku: 'GHOST-SKU', qty: 1 }],
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('GHOST-SKU') });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects zero or negative quantity', async () => {
    const { submitTool, spy } = buildToolsAgainstMockAdapter();

    const result = await submitTool.handler({
      client_rfc: 'CAL051103F36',
      lines: [{ sku: '021', qty: 0 }],
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('021') });
    expect(spy).not.toHaveBeenCalled();
  });

  it('uses uso_cfdi override when provided', async () => {
    const { submitTool, spy } = buildToolsAgainstMockAdapter();

    await submitTool.handler({
      client_rfc: 'CAL051103F36',
      lines: [{ sku: '021', qty: 1 }],
      uso_cfdi: 'G03',
    });

    const [invoices] = spy.mock.calls[0];
    expect(invoices[0].usoCFDI).toBe('G03');
  });
});
