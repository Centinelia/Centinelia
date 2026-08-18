import { describe, it, expect, beforeEach } from 'vitest';
import { MockBillingAdapter } from '../mock';

describe('MockBillingAdapter', () => {
  let adapter: MockBillingAdapter;
  beforeEach(() => {
    adapter = new MockBillingAdapter({
      clients: [
        { rfc: 'TDM040101ABC', adapterId: '42', razonSocial: 'TORTAS DONA MARIA SA', usoCFDI: 'G03', regimen: '601', codigoPostal: '64000' },
        { rfc: 'PLA980512XYZ', adapterId: '87', razonSocial: 'PANADERIA LOPEZ', usoCFDI: 'G03', regimen: '601', codigoPostal: '64000' },
      ],
      products: [
        { sku: 'TOR-MAI-KG', nombre: 'Tortilla de maiz', unidad: 'kg', precio: 18, claveSAT: '50161509', ivaTasa: 0 },
        { sku: 'TOR-HAR-KG', nombre: 'Tortilla de harina', unidad: 'kg', precio: 32, claveSAT: '50161509', ivaTasa: 0 },
      ],
    });
  });

  it('searchClient finds by fuzzy name', async () => {
    const results = await adapter.searchClient('dona mari', 3);
    expect(results[0].rfc).toBe('TDM040101ABC');
    expect(results[0].score).toBeGreaterThan(0.7);
  });

  it('searchClient returns empty when no match', async () => {
    const results = await adapter.searchClient('xyz inexistente', 3);
    expect(results).toEqual([]);
  });

  it('getClientByRFC returns null for unknown RFC', async () => {
    const client = await adapter.getClientByRFC('ZZZ999999ZZZ');
    expect(client).toBeNull();
  });

  it('getClientByRFC returns client for known RFC', async () => {
    const client = await adapter.getClientByRFC('TDM040101ABC');
    expect(client).not.toBeNull();
    expect(client?.razonSocial).toBe('TORTAS DONA MARIA SA');
  });

  it('searchProduct finds by fuzzy name', async () => {
    const results = await adapter.searchProduct('harina', 3);
    expect(results[0].sku).toBe('TOR-HAR-KG');
    expect(results[0].score).toBeGreaterThan(0.3);
  });

  it('submitInvoiceBatch returns file path for file-mode adapter', async () => {
    const result = await adapter.submitInvoiceBatch([
      {
        clientRFC: 'TDM040101ABC',
        date: '2026-08-17',
        lines: [{ sku: 'TOR-MAI-KG', qty: 5, unitPrice: 18 }],
        paymentMethod: 'efectivo',
        usoCFDI: 'G03',
      },
    ]);
    expect(result.mode).toBe('file');
    expect(result.ref).toMatch(/\.xml$/);
    expect(result.errors).toEqual([]);
  });

  it('freshness reports healthy by default', async () => {
    const h = await adapter.freshness();
    expect(h.healthy).toBe(true);
    expect(h.minutesStale).toBe(0);
  });

  it('supportsAutoStamping is false for mock (mimics file-based adapter)', () => {
    expect(adapter.supportsAutoStamping()).toBe(false);
  });
});
