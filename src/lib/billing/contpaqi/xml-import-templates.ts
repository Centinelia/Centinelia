/**
 * xml-import-templates.ts — Constantes para el generador de XML ADD de CONTPAQi.
 *
 * Centraliza valores fijos del esquema de importacion para que sean facilmente
 * ajustables en Fase 0 sin modificar la logica del generador.
 */

/** Namespace XML del esquema de importacion CONTPAQi Comercial v1. */
export const XML_NAMESPACE = 'http://www.contpaqi.com/comercial/import/v1';

/** Concepto de documento para facturas de venta. */
export const CONCEPTO_FACTURA = 'FACT';

/** Metodo de pago SAT: Pago en una sola exhibicion. */
export const METODO_PAGO_PUE = 'PUE';

/**
 * Mapa de formas de pago del dominio interno a clave SAT de 2 digitos.
 * Referencia: catalogo c_FormaPago del SAT.
 */
export const FORMA_PAGO_MAP: Record<string, string> = {
  efectivo: '01',
  cheque: '02',
  transferencia: '03',
  tarjeta: '04',
} as const;

/** Clave SAT de forma de pago por defecto cuando no hay coincidencia. */
export const FORMA_PAGO_DEFAULT = '99';
