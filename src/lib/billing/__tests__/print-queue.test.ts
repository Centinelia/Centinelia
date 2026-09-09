/**
 * Tests de enqueuePrintJob — validaciones + shape del JSON escrito.
 */
import { describe, it, expect, vi } from 'vitest';
import { enqueuePrintJob } from '../print-queue';

function fakeStorage() {
  const writes: Array<{ path: string; content: string }> = [];
  return {
    writes,
    storage: {
      writeFile: vi.fn(async (path: string, buffer: Buffer) => {
        writes.push({ path, content: buffer.toString('utf-8') });
        return path;
      }),
    },
  };
}

describe('enqueuePrintJob', () => {
  it('escribe job con UUID a /print_queue/YYYY/MM/', async () => {
    const { storage, writes } = fakeStorage();
    const r = await enqueuePrintJob({
      storage: storage as unknown as Parameters<typeof enqueuePrintJob>[0]['storage'],
      basePath: '/Facturacion',
      ref: { uuid: 'abc12345-def6-7890-abcd-1234567890ff' },
      requestedBy: 'beatriz@x.com',
    });
    expect(r.jobId).toMatch(/^prn_/);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toMatch(/^\/Facturacion\/print_queue\/\d{4}\/\d{2}\/prn_.+\.json$/);
    const job = JSON.parse(writes[0].content);
    expect(job.cfdi_ref.uuid).toBe('abc12345-def6-7890-abcd-1234567890ff');
    expect(job.requested_by).toBe('beatriz@x.com');
    expect(job.copies).toBe(1);
    expect(job.status).toBe('pending');
  });

  it('acepta serie + folio', async () => {
    const { storage, writes } = fakeStorage();
    await enqueuePrintJob({
      storage: storage as unknown as Parameters<typeof enqueuePrintJob>[0]['storage'],
      basePath: '/x',
      ref: { serie: 'FTEN', folio: '1234' },
      copies: 3,
      requestedBy: 'a@b.com',
    });
    const job = JSON.parse(writes[0].content);
    expect(job.cfdi_ref.serie).toBe('FTEN');
    expect(job.cfdi_ref.folio).toBe('1234');
    expect(job.copies).toBe(3);
  });

  it('acepta rfc + rango de fechas', async () => {
    const { storage } = fakeStorage();
    const r = await enqueuePrintJob({
      storage: storage as unknown as Parameters<typeof enqueuePrintJob>[0]['storage'],
      basePath: '/x',
      ref: { clienteRfc: 'ABC010101ABC', fechaDesde: '2026-09-01', fechaHasta: '2026-09-10' },
      requestedBy: 'a@b.com',
    });
    expect(r.jobId).toMatch(/^prn_/);
  });

  it('rechaza ref sin nada útil', async () => {
    const { storage } = fakeStorage();
    await expect(enqueuePrintJob({
      storage: storage as unknown as Parameters<typeof enqueuePrintJob>[0]['storage'],
      basePath: '/x',
      ref: {},
      requestedBy: 'a@b.com',
    })).rejects.toThrow(/uuid|serie|clienteRfc/);
  });

  it('normaliza copies a mínimo 1', async () => {
    const { storage, writes } = fakeStorage();
    await enqueuePrintJob({
      storage: storage as unknown as Parameters<typeof enqueuePrintJob>[0]['storage'],
      basePath: '/x',
      ref: { uuid: 'aaaa1111-bbbb-2222-cccc-333344445555' },
      copies: 0,
      requestedBy: 'a@b.com',
    });
    expect(JSON.parse(writes[0].content).copies).toBe(1);
  });

  it('printer_name propaga', async () => {
    const { storage, writes } = fakeStorage();
    await enqueuePrintJob({
      storage: storage as unknown as Parameters<typeof enqueuePrintJob>[0]['storage'],
      basePath: '/x',
      ref: { uuid: 'aaaa1111-bbbb-2222-cccc-333344445555' },
      printerName: 'HP-LaserJet-Beatriz',
      requestedBy: 'a@b.com',
    });
    expect(JSON.parse(writes[0].content).printer_name).toBe('HP-LaserJet-Beatriz');
  });
});
