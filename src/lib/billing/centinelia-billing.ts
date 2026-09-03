/**
 * Data layer para el historial event-sourced de facturación de Centinelia
 * (tabla centinelia_billing). Cada emisión, pago, REP o cancelación es un
 * evento append-only.
 *
 * Idempotencia crítica: la constraint unique en (cliente_id, tipo, ciclo_key)
 * garantiza que el cron no facture 2 veces el mismo ciclo para el mismo
 * cliente aunque se ejecute múltiples veces.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type BillingEventTipo =
  | 'cfdi_emitido'
  | 'rep_emitido'
  | 'pago_recibido'
  | 'cancelacion'
  | 'error_emision';

export interface CentineliaBillingEvent {
  id:                 string;
  cliente_id:         string;
  tipo:               BillingEventTipo;
  ciclo_key:          string | null;
  cfdi_uuid:          string | null;
  related_uuid:       string | null;
  provider_ref:       string | null;
  monto:              number | null;
  moneda:             string | null;
  xml_path:           string | null;
  pdf_path:           string | null;
  qr_path:            string | null;
  sent_to_email:      string | null;
  sent_at:            string | null;
  stripe_payment_id:  string | null;
  error_code:         number | null;
  error_message:      string | null;
  meta:               Record<string, unknown>;
  created_at:         string;
}

export interface BillingEventInput {
  cliente_id:         string;
  tipo:               BillingEventTipo;
  ciclo_key?:         string | null;
  cfdi_uuid?:         string | null;
  related_uuid?:      string | null;
  provider_ref?:      string | null;
  monto?:             number | null;
  moneda?:            string | null;
  xml_path?:          string | null;
  pdf_path?:          string | null;
  qr_path?:           string | null;
  sent_to_email?:     string | null;
  sent_at?:           string | null;
  stripe_payment_id?: string | null;
  error_code?:        number | null;
  error_message?:     string | null;
  meta?:              Record<string, unknown>;
}

const TABLE = 'centinelia_billing';

export async function recordBillingEvent(
  event: BillingEventInput,
  supabase: SupabaseClient = createAdminClient(),
): Promise<CentineliaBillingEvent> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(event)
    .select('*')
    .single();
  if (error) throw new Error(`recordBillingEvent: ${error.message}`);
  return data as CentineliaBillingEvent;
}

/**
 * Verifica si ya se emitió CFDI o REP para (cliente, ciclo). Se usa desde
 * el cron nala-billing-cycle ANTES de intentar timbrar, para saltarse
 * clientes ya facturados este ciclo.
 */
export async function yaFacturadoEsteCiclo(
  clienteId: string,
  cicloKey: string,
  tipo: 'cfdi_emitido' | 'rep_emitido',
  supabase: SupabaseClient = createAdminClient(),
): Promise<CentineliaBillingEvent | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('ciclo_key', cicloKey)
    .eq('tipo', tipo)
    .maybeSingle();
  if (error) throw new Error(`yaFacturadoEsteCiclo: ${error.message}`);
  return (data as CentineliaBillingEvent | null) ?? null;
}

export async function listBillingForCliente(
  clienteId: string,
  opts: { limit?: number } = {},
  supabase: SupabaseClient = createAdminClient(),
): Promise<CentineliaBillingEvent[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (error) throw new Error(`listBillingForCliente: ${error.message}`);
  return (data ?? []) as CentineliaBillingEvent[];
}

/**
 * Busca CFDI emitido por UUID para lookup rápido cuando llega comprobante SPEI.
 * Nala usa esto para saber a qué factura corresponde el pago recibido.
 */
export async function findCfdiByUuid(
  uuid: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<CentineliaBillingEvent | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('cfdi_uuid', uuid)
    .eq('tipo', 'cfdi_emitido')
    .maybeSingle();
  if (error) throw new Error(`findCfdiByUuid: ${error.message}`);
  return (data as CentineliaBillingEvent | null) ?? null;
}
