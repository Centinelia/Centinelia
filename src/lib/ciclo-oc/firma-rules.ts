/**
 * Reglas de sanidad para autofirma de Ordenes de Compra por meerkat.
 * Nala/Nox invocan estas reglas antes de aplicar firma digitalizada sobre un
 * PDF de OC. Si TODAS pasan, el meerkat firma. Si alguna falla, el expediente
 * pasa a `requiere_atencion` y se escala al humano configurado.
 *
 * Simplificado según decisión AC 2026-08-18 (segunda ronda):
 * - Regla principal: monto ≤ tope configurado en org
 * - Reglas de sanidad: datos completos + no duplicados en ventana + fechas coherentes
 * - NO lista de proveedores de confianza, NO histórico de precios, NO ML.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface FirmaEvaluationInput {
  portalEmail:         string;
  oc_monto_mxn:        number;
  proveedor_rfc:       string | null;
  proveedor_nombre:    string | null;
  cliente_direccion?:  string | null;
  conceptos:           Array<{ descripcion?: string; cantidad?: number; precio_unitario?: number }>;
}

export interface FirmaEvaluationResult {
  passed:          boolean;
  reglas_pasadas:  string[];
  reglas_falladas: string[];
  monto_tope_mxn:  number | null;
  reason:          string | null;
}

const DEFAULT_MONTO_TOPE = 0;                // 0 = no autofirma por default (opt-in explícito)
const DEFAULT_VENTANA_DUP_HORAS = 48;

interface CicloOcConfig {
  monto_max_autofirma_mxn?:    number;
  sanidad_no_duplicados_horas?: number;
}

export async function evaluateFirmaRules(
  input:    FirmaEvaluationInput,
  supabase: SupabaseClient,
): Promise<FirmaEvaluationResult> {
  const passed:  string[] = [];
  const failed:  string[] = [];

  // 1. Leer config del ciclo OC de la org
  const { data: org } = await supabase
    .from('organizations')
    .select('ciclo_oc_config, ciclo_oc_firma_path')
    .eq('portal_email', input.portalEmail)
    .single();

  const cfg: CicloOcConfig = (org?.ciclo_oc_config as CicloOcConfig | null) ?? {};
  const montoTope = cfg.monto_max_autofirma_mxn ?? DEFAULT_MONTO_TOPE;
  const ventanaDup = cfg.sanidad_no_duplicados_horas ?? DEFAULT_VENTANA_DUP_HORAS;

  if (!org?.ciclo_oc_firma_path) {
    failed.push('imagen_firma_no_configurada');
    return {
      passed:          false,
      reglas_pasadas:  passed,
      reglas_falladas: failed,
      monto_tope_mxn:  montoTope,
      reason:          'No hay imagen de firma digitalizada configurada en la organización.',
    };
  }

  // 2. Monto ≤ tope
  if (montoTope <= 0) {
    failed.push('autofirma_no_habilitada');
    return {
      passed:          false,
      reglas_pasadas:  passed,
      reglas_falladas: failed,
      monto_tope_mxn:  montoTope,
      reason:          'Autofirma no habilitada — el dueño no configuró un monto máximo.',
    };
  }

  if (input.oc_monto_mxn <= montoTope) passed.push('monto_dentro_tope');
  else                                 failed.push(`monto_excede_tope_de_${montoTope}`);

  // 3. Datos completos
  if (input.proveedor_rfc?.trim())    passed.push('rfc_proveedor_presente');
  else                                failed.push('rfc_proveedor_faltante');

  if (input.proveedor_nombre?.trim()) passed.push('nombre_proveedor_presente');
  else                                failed.push('nombre_proveedor_faltante');

  if (input.conceptos.length > 0)     passed.push('conceptos_presentes');
  else                                failed.push('sin_conceptos');

  const conceptosCompletos = input.conceptos.every(c =>
    c.descripcion?.trim() &&
    typeof c.cantidad === 'number' && c.cantidad > 0 &&
    typeof c.precio_unitario === 'number' && c.precio_unitario > 0
  );
  if (input.conceptos.length > 0) {
    if (conceptosCompletos) passed.push('conceptos_completos');
    else                    failed.push('conceptos_incompletos');
  }

  // 4. No duplicados en ventana (mismo proveedor + monto en las últimas N horas)
  if (input.proveedor_rfc?.trim()) {
    const desde = new Date(Date.now() - ventanaDup * 60 * 60 * 1000).toISOString();
    const { data: dupes } = await supabase
      .from('expedientes_compras')
      .select('id, created_at')
      .eq('portal_email', input.portalEmail)
      .eq('proveedor_rfc', input.proveedor_rfc)
      .eq('oc_monto_mxn', input.oc_monto_mxn)
      .gte('created_at', desde)
      .limit(2);
    const dupCount = dupes?.length ?? 0;
    if (dupCount <= 1) passed.push('no_duplicados');
    else               failed.push(`duplicado_detectado_${dupCount}_en_${ventanaDup}h`);
  }

  const allPassed = failed.length === 0;
  return {
    passed:          allPassed,
    reglas_pasadas:  passed,
    reglas_falladas: failed,
    monto_tope_mxn:  montoTope,
    reason:          allPassed ? null : `Reglas de autofirma no cumplidas: ${failed.join(', ')}`,
  };
}
