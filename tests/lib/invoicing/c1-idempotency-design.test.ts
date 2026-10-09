import { describe, it, expect } from 'vitest';
import { computeArgsHash } from '@/lib/tools/dedup/hash-args';
import type { CfdiInput } from '@/lib/invoicing/provider';

/**
 * Spec vivo del diseño de idempotencia para el adapter InvoiceOne C1.
 *
 * El adapter C1 (futuro, en src/lib/invoicing/invoiceone/c1-connector/) genera
 * un TXT por cada CFDI a timbrar y lo deposita en una carpeta SFTP del
 * conector de IPark. Como Vercel puede reintentar funciones o Nala puede
 * reprocesar un correo, necesitamos una clave de idempotencia que:
 *
 *   1. Produzca el mismo hash para la misma intención fiscal (mismo correo
 *      de origen, mismo receptor, mismo total, mismos conceptos).
 *   2. Produzca hashes distintos cuando cualquier campo identificatorio
 *      cambia (RFC, total, conceptos).
 *   3. Ignore campos irrelevantes (formaPago entre reintentos, timestamps,
 *      datos derivados como subtotal/iva, campos constantes como emisor).
 *
 * Reutilizamos computeArgsHash como primitiva (ya tiene NFD normalize +
 * sort deep + sha256). Lo nuevo es solo:
 *   - El sort canónico de conceptos antes del hash.
 *   - La selección explícita de identity keys.
 *
 * Cuando se implemente c1-connector/idempotency.ts, debe exportar
 * computeCfdiIdempotencyKey(sourceRef, cfdi) replicando la lógica abajo.
 */

interface IdempotencyInput {
  source_ref: string;
  cfdi: CfdiInput;
}

function computeCfdiIdempotencyKey({ source_ref, cfdi }: IdempotencyInput): string {
  const sortedConceptos = [...cfdi.conceptos]
    .sort((a, b) => {
      const ka = `${a.claveProdServ}|${a.descripcion}|${a.importe}`;
      const kb = `${b.claveProdServ}|${b.descripcion}|${b.importe}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map(c => ({
      claveProdServ: c.claveProdServ,
      claveUnidad: c.claveUnidad,
      cantidad: c.cantidad,
      descripcion: c.descripcion,
      valorUnitario: c.valorUnitario,
      importe: c.importe,
    }));

  const identity = {
    source_ref,
    rfc_receptor: cfdi.receptor.rfc,
    nombre_receptor: cfdi.receptor.nombre,
    uso_cfdi: cfdi.receptor.usoCfdi,
    regimen_receptor: cfdi.receptor.regimenFiscal,
    cp_receptor: cfdi.receptor.domicilioFiscal,
    moneda: cfdi.moneda,
    total: cfdi.total,
    conceptos: sortedConceptos,
  };

  return computeArgsHash('invoiceone_c1_timbrar', identity, {
    identity_keys: [
      'source_ref', 'rfc_receptor', 'nombre_receptor',
      'uso_cfdi', 'regimen_receptor', 'cp_receptor',
      'moneda', 'total',
    ],
  });
}

const baseCfdi: CfdiInput = {
  emisor: { rfc: 'IPA200101ABC', regimenFiscal: '601', nombre: 'IPARK ESTACIONAMIENTOS SA DE CV' },
  receptor: {
    rfc: 'GME150312J78',
    nombre: 'Grupo Mex Consultores SC',
    usoCfdi: 'G03',
    regimenFiscal: '601',
    domicilioFiscal: '66220',
  },
  lugarExpedicion: '66600',
  formaPago: '03',
  metodoPago: 'PUE',
  moneda: 'MXN',
  conceptos: [{
    claveProdServ: '90111500',
    claveUnidad: 'E48',
    cantidad: 3,
    descripcion: 'Servicio de estacionamiento IPark MTY, 3 dias (del 2026-09-03 al 2026-09-06), boleto 2087341',
    valorUnitario: 258.62,
    importe: 775.86,
    iva: 124.14,
  }],
  subtotal: 775.86,
  iva: 124.14,
  total: 900.00,
  csd: { cerPem: 'secret', keyPem: 'secret', noCertificado: '00001000000500000000' },
  pacCredentials: { usuario: 'demo', password: 'demo' },
};

describe('C1 idempotency key design', () => {
  it('mismo input produce mismo hash (determinismo)', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('source_ref distinto produce hash distinto (correo distinto, aunque CFDI identico)', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({ source_ref: 'msg-002', cfdi: baseCfdi });
    expect(h1).not.toBe(h2);
  });

  it('RFC receptor distinto produce hash distinto', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: { ...baseCfdi, receptor: { ...baseCfdi.receptor, rfc: 'OTR900101XYZ' } },
    });
    expect(h1).not.toBe(h2);
  });

  it('total distinto produce hash distinto', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: { ...baseCfdi, total: 1500.00 },
    });
    expect(h1).not.toBe(h2);
  });

  it('formaPago distinta NO cambia hash (puede variar entre reintentos)', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: { ...baseCfdi, formaPago: '04' },
    });
    expect(h1).toBe(h2);
  });

  it('subtotal / iva distintos NO cambian hash (son derivados del total)', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: { ...baseCfdi, subtotal: 999.99, iva: 0.01 },
    });
    expect(h1).toBe(h2);
  });

  it('emisor distinto NO cambia hash (constante por org, no identifica el request)', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: { ...baseCfdi, emisor: { rfc: 'OTR900101XYZ', regimenFiscal: '601', nombre: 'OTRA SA' } },
    });
    expect(h1).toBe(h2);
  });

  it('credenciales PAC o CSD distintos NO cambian hash (secretos, no identifican intencion)', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: {
        ...baseCfdi,
        csd: { cerPem: 'other-secret', keyPem: 'other-secret', noCertificado: '99999' },
        pacCredentials: { usuario: 'otro', password: 'otro' },
      },
    });
    expect(h1).toBe(h2);
  });

  it('conceptos en distinto orden producen el mismo hash (sort canonico interno)', () => {
    const cfdiA: CfdiInput = {
      ...baseCfdi,
      conceptos: [
        { claveProdServ: '90111500', claveUnidad: 'E48', cantidad: 2, descripcion: 'Estancia MTY boleto 2089115', valorUnitario: 200, importe: 400 },
        { claveProdServ: '90111500', claveUnidad: 'E48', cantidad: 3, descripcion: 'Estancia MTY boleto 2093440', valorUnitario: 250, importe: 750 },
      ],
      subtotal: 1150,
      iva: 184,
      total: 1334,
    };
    const cfdiB: CfdiInput = {
      ...cfdiA,
      conceptos: [cfdiA.conceptos[1], cfdiA.conceptos[0]],
    };
    const hA = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: cfdiA });
    const hB = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: cfdiB });
    expect(hA).toBe(hB);
  });

  it('concepto con descripcion ligeramente distinta SI cambia hash', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: {
        ...baseCfdi,
        conceptos: [{
          ...baseCfdi.conceptos[0],
          descripcion: baseCfdi.conceptos[0].descripcion + ' (modificado)',
        }],
      },
    });
    expect(h1).not.toBe(h2);
  });

  it('cantidad o valorUnitario distintos SI cambian hash (aunque importe se mantenga)', () => {
    const h1 = computeCfdiIdempotencyKey({ source_ref: 'msg-001', cfdi: baseCfdi });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: {
        ...baseCfdi,
        conceptos: [{
          ...baseCfdi.conceptos[0],
          cantidad: 6,
          valorUnitario: 129.31,
        }],
      },
    });
    expect(h1).not.toBe(h2);
  });

  it('nombre receptor normaliza acentos y case (Jose vs José, mayus vs minus)', () => {
    const h1 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: { ...baseCfdi, receptor: { ...baseCfdi.receptor, nombre: 'GRUPO MEX CONSULTORES SC' } },
    });
    const h2 = computeCfdiIdempotencyKey({
      source_ref: 'msg-001',
      cfdi: { ...baseCfdi, receptor: { ...baseCfdi.receptor, nombre: 'grupo méx consultóres sc' } },
    });
    expect(h1).toBe(h2);
  });
});
