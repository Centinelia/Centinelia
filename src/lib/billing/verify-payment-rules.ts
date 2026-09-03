/**
 * Reglas de auto-aprobación de pagos SPEI reportados por clientes.
 *
 * Nala recibe un comprobante SPEI. Antes de timbrar el REP, evalúa reglas:
 *   - CFDI referenciado existe en centinelia_billing (tipo='cfdi_emitido')
 *   - Cliente asociado activo en centinelia_clientes
 *   - Monto pagado === monto CFDI (tolerancia $0.01)
 *   - No existe ya pago_recibido para ese CFDI (dedupe)
 *
 * Si TODAS pasan → autoAprobar: true, sistema timbra REP inmediato.
 * Si CUALQUIERA falla → autoAprobar: false, requiere aprobación manual.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PagoReportado {
  cfdi_uuid_original:  string;
  monto_pagado:        number;
  fecha_pago:          string;
  num_operacion?:      string | null;
  receptor_email?:     string | null;
}

export interface VerificationResult {
  autoAprobar:      boolean;
  motivos:          string[];   // razones por las que NO se auto-aprueba (vacío si sí)
  cfdiOriginal:     null | {
    id: string;
    cliente_id: string;
    monto: number;
    ciclo_key: string | null;
    sent_to_email: string | null;
  };
  cliente:          null | {
    id: string;
    razon_social: string;
    activo: boolean;
    correo_facturacion: string;
    rfc: string;
  };
  pagoDuplicado:    boolean;
}

const AMOUNT_TOLERANCE = 0.01;

export async function evaluarPagoParaAutoAprobacion(
  pago: PagoReportado,
  supabase: SupabaseClient,
): Promise<VerificationResult> {
  const motivos: string[] = [];

  // 1. Busca CFDI original
  const { data: cfdi } = await supabase
    .from('centinelia_billing')
    .select('id, cliente_id, monto, ciclo_key, sent_to_email')
    .eq('tipo', 'cfdi_emitido')
    .eq('cfdi_uuid', pago.cfdi_uuid_original)
    .maybeSingle();

  if (!cfdi) {
    return {
      autoAprobar: false,
      motivos: [`UUID ${pago.cfdi_uuid_original} no encontrado en histórico de emisiones`],
      cfdiOriginal: null,
      cliente: null,
      pagoDuplicado: false,
    };
  }

  // 2. Busca cliente
  const { data: cliente } = await supabase
    .from('centinelia_clientes')
    .select('id, razon_social, activo, correo_facturacion, rfc')
    .eq('id', cfdi.cliente_id)
    .maybeSingle();

  if (!cliente) {
    motivos.push('CFDI existe pero cliente asociado no encontrado');
  } else if (!cliente.activo) {
    motivos.push(`Cliente "${cliente.razon_social}" está pausado`);
  }

  // 3. Monto exacto (tolerancia $0.01)
  const cfdiMonto = Number(cfdi.monto);
  const diff = Math.abs(cfdiMonto - pago.monto_pagado);
  if (diff > AMOUNT_TOLERANCE) {
    motivos.push(
      `Monto pagado ($${pago.monto_pagado.toFixed(2)}) no coincide con CFDI ($${cfdiMonto.toFixed(2)}) — diferencia $${diff.toFixed(2)}`,
    );
  }

  // 4. Dedupe — ¿ya existe pago_recibido para este CFDI?
  const { data: pagoPrevio } = await supabase
    .from('centinelia_billing')
    .select('id')
    .eq('tipo', 'pago_recibido')
    .eq('related_uuid', pago.cfdi_uuid_original)
    .maybeSingle();

  const pagoDuplicado = !!pagoPrevio;
  if (pagoDuplicado) {
    motivos.push(`Ya existe un pago registrado para el CFDI ${pago.cfdi_uuid_original}`);
  }

  return {
    autoAprobar: motivos.length === 0,
    motivos,
    cfdiOriginal: cfdi,
    cliente: cliente ?? null,
    pagoDuplicado,
  };
}
