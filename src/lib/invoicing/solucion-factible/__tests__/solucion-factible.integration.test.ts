// src/lib/invoicing/solucion-factible/__tests__/solucion-factible.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { solucionFactibleProvider } from '../index';
import { parseCsd } from '../../csd-vault';
import type { CfdiInput } from '../../provider';

// ─── Double gate: env var + fixtures on disk ─────────────────────────────────
const SF_ENABLED = process.env.SF_INTEGRATION_TESTS === 'true';

const CSD_DIR = join(process.cwd(), 'fixtures', 'sat-test-csd');
const CSD_CER = join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.cer');
const CSD_KEY = join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.key');
const CSD_PW  = join(CSD_DIR, 'PASSWORD.txt');
const CSD_FIXTURES_AVAILABLE = existsSync(CSD_CER) && existsSync(CSD_KEY) && existsSync(CSD_PW);

const RUN_INTEGRATION = SF_ENABLED && CSD_FIXTURES_AVAILABLE;

const PAC = { usuario: 'testing@solucionfactible.com', password: 'timbrado.SF.16672' };

describe.skipIf(!RUN_INTEGRATION)('SolucionFactibleProvider integration (sandbox)', () => {
  let parsed: ReturnType<typeof parseCsd>;

  beforeAll(() => {
    parsed = parseCsd(
      readFileSync(CSD_CER),
      readFileSync(CSD_KEY),
      readFileSync(CSD_PW, 'utf8').trim(),
    );
  });

  function baseCfdi(overrides: Partial<CfdiInput> = {}): CfdiInput {
    return {
      emisor: { rfc: 'LAN7008173R5', regimenFiscal: '601', nombre: 'ESCUELA KEMPER URGATE' },
      receptor: {
        rfc: 'XAXX010101000', nombre: 'PUBLICO EN GENERAL',
        usoCfdi: 'S01', regimenFiscal: '616', domicilioFiscal: '64000',
      },
      lugarExpedicion: '64000',
      formaPago: '03', metodoPago: 'PUE',
      moneda: 'MXN',
      conceptos: [{
        claveProdServ: '01010101', claveUnidad: 'H87', cantidad: 1,
        descripcion: 'Consultoría', valorUnitario: 100, importe: 100, iva: 16,
      }],
      subtotal: 100, iva: 16, total: 116,
      csd: { cerPem: parsed.cerPem, keyPem: parsed.keyPem, noCertificado: parsed.noCertificado },
      pacCredentials: PAC,
      ...overrides,
    };
  }

  it('timbra un CFDI happy-path y devuelve UUID', { timeout: 60000 }, async () => {
    const res = await solucionFactibleProvider.timbrar(baseCfdi(), { testMode: true });
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (res.ok) {
      expect(res.uuid).toMatch(/^[0-9A-F-]{36}$/i);
      expect(res.selloSat.length).toBeGreaterThan(100);
      expect(res.xmlTimbrado.length).toBeGreaterThan(500);
    }
  });

  it('rechaza con creds inválidas (601)', { timeout: 60000 }, async () => {
    const bad = baseCfdi({ pacCredentials: { usuario: 'no@existe', password: 'nada' } });
    const res = await solucionFactibleProvider.timbrar(bad, { testMode: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(601);
  });
});
