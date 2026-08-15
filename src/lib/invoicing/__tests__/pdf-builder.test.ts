import { describe, it, expect } from 'vitest';
import { buildCfdiPdf } from '../pdf-builder';

describe('pdf-builder', () => {
  it('genera un buffer PDF > 1kb', async () => {
    const buf = await buildCfdiPdf({
      emisor: { rfc: 'AAA010101AAA', nombre: 'Test SA', regimenFiscal: '601' },
      receptor: { rfc: 'XAXX010101000', nombre: 'Público', usoCfdi: 'S01' },
      conceptos: [{ descripcion: 'Servicio', cantidad: 1, valorUnitario: 100, importe: 100 }],
      subtotal: 100, iva: 16, total: 116,
      uuid: '12345678-1234-1234-1234-123456789012',
      selloSat: 'x'.repeat(200),
      certificadoSat: '00001000000000000001',
      fechaTimbrado: '2026-08-12T10:00:00',
      cadenaOriginal: '||1.1|...',
      qrPng: Buffer.from([0x89,0x50,0x4E,0x47]),
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });
});
