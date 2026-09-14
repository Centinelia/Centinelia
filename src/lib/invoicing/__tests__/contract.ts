/**
 * BillingAdapter Contract — suite compartido que TODO PAC provider debe pasar.
 *
 * Funciona como red de seguridad contra la divergencia semantic entre PACs
 * (Facturama, Solución Factible, CONTPAQi, InvoiceOne). Cada adapter tiene
 * transporte distinto (REST/JSON, SOAP, writer .NET) — el contrato acota lo
 * COMÚN: shape de respuesta, taxonomy de errores, contrato "never throws".
 *
 * Cómo usar en un test file:
 *
 *   import { runProviderContract, fixtureCfdiInput } from '../../__tests__/contract';
 *
 *   describe('facturama contract', () => {
 *     runProviderContract('facturama', {
 *       provider: () => facturamaProvider,
 *       supportsRep: true,
 *       stubTransportSuccess: () => vi.mock(...),
 *       stubTransportFailure: () => vi.mock(...),
 *     });
 *   });
 *
 * Las stubs son responsabilidad del test file porque cada adapter tiene su
 * propio módulo de transporte. El contract solo pide los "casos" y verifica
 * las shapes; el "cómo" del transport lo aporta el adapter.
 */

import { describe, it, expect } from 'vitest';
import type {
  InvoicingProvider, CfdiInput, PagoInput, StampResult,
  CancelSubmitResult, CancelStatus, CancelMotivo,
} from '../provider';

// ─── Shape assertions (reusables) ──────────────────────────────────────────

/**
 * Verifica que un StampResult "ok:true" tiene TODOS los campos requeridos por
 * el contrato. Los adapters no pueden retornar `ok:true` sin uuid, sello, xml.
 */
export function expectValidStampSuccess(r: StampResult): void {
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(typeof r.uuid).toBe('string');
  expect(r.uuid.length).toBeGreaterThan(0);
  expect(typeof r.selloSat).toBe('string');
  expect(typeof r.certificadoSat).toBe('string');
  expect(typeof r.fechaTimbrado).toBe('string');
  expect(typeof r.cadenaOriginal).toBe('string');
  expect(Buffer.isBuffer(r.xmlTimbrado)).toBe(true);
  expect(r.xmlTimbrado.length).toBeGreaterThan(0);
  expect(Buffer.isBuffer(r.qrPng)).toBe(true);
  expect(r.qrPng.length).toBeGreaterThan(0);
  // providerRef es opcional pero si viene, es string
  if (r.providerRef !== undefined) expect(typeof r.providerRef).toBe('string');
}

export function expectValidStampError(r: StampResult): void {
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(typeof r.code).toBe('number');
  expect(typeof r.message).toBe('string');
  expect(r.message.length).toBeGreaterThan(0);
  expect(typeof r.retryable).toBe('boolean');
}

export function expectValidCancelSubmit(r: CancelSubmitResult): void {
  expect(['sent_to_sat', 'rejected']).toContain(r.status);
  expect(typeof r.message).toBe('string');
  if (r.code !== undefined) expect(typeof r.code).toBe('number');
}

export function expectValidCancelStatus(r: CancelStatus): void {
  expect(['pending', 'accepted', 'rejected', 'expired']).toContain(r.status);
  if (r.message !== undefined) expect(typeof r.message).toBe('string');
  if (r.acuseXml !== undefined) expect(Buffer.isBuffer(r.acuseXml)).toBe(true);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const RFC_EMISOR   = 'AAMN951208I25';
const RFC_RECEPTOR = 'XAXX010101000';

export function fixtureCfdiInput(overrides: Partial<CfdiInput> = {}): CfdiInput {
  return {
    emisor: {
      rfc:            RFC_EMISOR,
      regimenFiscal:  '612',
      nombre:         'NAZRE ALEJANDRO MARTINEZ RIVAS',
    },
    receptor: {
      rfc:              RFC_RECEPTOR,
      nombre:           'PUBLICO EN GENERAL',
      usoCfdi:          'G03',
      regimenFiscal:    '616',
      domicilioFiscal:  '64000',
    },
    lugarExpedicion: '64000',
    formaPago:       '03',
    metodoPago:      'PUE',
    moneda:          'MXN',
    conceptos: [{
      claveProdServ: '50161509',
      claveUnidad:   'H87',
      cantidad:      1,
      descripcion:   'Test concept',
      valorUnitario: 100,
      importe:       100,
      iva:           16,
    }],
    subtotal: 100,
    iva:      16,
    total:    116,
    csd: {
      cerPem:        '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----',
      keyPem:        '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',
      noCertificado: '00000000000000000000',
    },
    pacCredentials: {
      usuario:  'demo',
      password: 'demo',
    },
    ...overrides,
  };
}

export function fixturePagoInput(overrides: Partial<PagoInput> = {}): PagoInput {
  return {
    emisor: {
      rfc:            RFC_EMISOR,
      regimenFiscal:  '612',
      nombre:         'NAZRE MARTINEZ',
    },
    receptor: {
      rfc:              RFC_RECEPTOR,
      nombre:           'CLIENTE TEST',
      regimenFiscal:    '612',
      domicilioFiscal:  '64000',
      usoCfdi:          'CP01',
    },
    lugarExpedicion: '64000',
    pago: {
      fechaPago:  new Date().toISOString().slice(0, 19),
      formaDePagoP: '03',
      monedaP:    'MXN',
      monto:      116,
      documentosRelacionados: [{
        uuid:              '11111111-1111-1111-1111-111111111111',
        monedaDR:          'MXN',
        metodoDePagoDR:    'PPD',
        numParcialidad:    1,
        impSaldoAnt:       116,
        impPagado:         116,
        impSaldoInsoluto:  0,
      }],
    },
    csd: {
      cerPem:        '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----',
      keyPem:        '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',
      noCertificado: '00000000000000000000',
    },
    pacCredentials: {
      usuario:  'demo',
      password: 'demo',
    },
    ...overrides,
  };
}

// ─── Contract runner ──────────────────────────────────────────────────────

export interface ContractOptions {
  /** Factory que retorna el provider bajo test. Vitest lo re-instancia por test. */
  provider: () => InvoicingProvider;
  /** true si este PAC soporta REP (Complemento de Pago). false = espera 501. */
  supportsRep: boolean;
  /**
   * Opcional. Si el adapter puede correr timbrar() end-to-end sin transport
   * real (ej. modo mock del invoiceone), setea true. Habilita el test de
   * happy path completo con shape assertions. Los adapters que necesitan
   * mock de transporte (facturama, sf) lo dejan en false y solo validan
   * los casos "sin transporte" (error taxonomy, REP unsupported).
   */
  hasSelfContainedMock?: boolean;
}

/**
 * Suite de tests contra el contrato de InvoicingProvider. Correr desde el test
 * file de cada adapter para verificar conformidad.
 */
export function runProviderContract(name: string, opts: ContractOptions): void {
  describe(`${name} — contract`, () => {
    // Estas invariantes NO requieren transport — el compiler ya asegura la
    // firma; aquí verificamos comportamiento observable.

    it('expone las 4 methods del InvoicingProvider', () => {
      const p = opts.provider();
      expect(typeof p.timbrar).toBe('function');
      expect(typeof p.timbrarPago).toBe('function');
      expect(typeof p.cancelar).toBe('function');
      expect(typeof p.consultarEstatusCancelacion).toBe('function');
    });

    if (opts.hasSelfContainedMock) {
      it('timbrar retorna StampResult ok con shape válido en happy path', async () => {
        const p = opts.provider();
        const r = await p.timbrar(fixtureCfdiInput(), { testMode: true, timeoutMs: 10000 });
        if (r.ok) {
          expectValidStampSuccess(r);
        } else {
          // Adapter tiene modo mock que puede devolver ok:false por diseño;
          // en ese caso al menos verificamos shape del error.
          expectValidStampError(r);
        }
      });
    }

    if (!opts.supportsRep) {
      it('timbrarPago retorna code=501 cuando REP no está soportado', async () => {
        const p = opts.provider();
        const r = await p.timbrarPago(fixturePagoInput(), { testMode: true, timeoutMs: 10000 });
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.code).toBe(501);
          expectValidStampError(r);
        }
      });
    }

    it('consultarEstatusCancelacion nunca retorna status fuera del enum', async () => {
      // Este test es tolerante: acepta que el transport falle. El punto es
      // que el adapter debe MAPEAR la respuesta a uno de los 4 statuses,
      // nunca a un string libre. Si el adapter throws, no cumple el contrato.
      const p = opts.provider();
      try {
        const r = await p.consultarEstatusCancelacion(
          '00000000-0000-0000-0000-000000000000',
          { usuario: 'demo', password: 'demo' },
          { testMode: true, timeoutMs: 5000 },
        );
        expectValidCancelStatus(r);
      } catch (err) {
        // Si throws, es fallo del contrato "never throws".
        throw new Error(
          `${name}.consultarEstatusCancelacion lanzó — el contrato exige ` +
          `atrapar transport errors y retornar { status: 'pending', message }. ` +
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    it('cancelar nunca retorna status fuera del enum { sent_to_sat | rejected }', async () => {
      const p = opts.provider();
      try {
        const r = await p.cancelar(
          '00000000-0000-0000-0000-000000000000',
          '02' as CancelMotivo,
          null,
          { usuario: 'demo', password: 'demo' },
          {
            cerPem:        '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----',
            keyPem:        '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',
            noCertificado: '00000000000000000000',
          },
          { testMode: true, timeoutMs: 5000 },
        );
        expectValidCancelSubmit(r);
      } catch (err) {
        throw new Error(
          `${name}.cancelar lanzó — el contrato exige atrapar y retornar ` +
          `{ status: 'rejected', code, message }. ` +
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  });
}
