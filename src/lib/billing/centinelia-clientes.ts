/**
 * Data layer para el catálogo de clientes recurrentes de Centinelia
 * (tabla centinelia_clientes). Se usa desde:
 *   - Cron nala-billing-cycle (para saber qué facturar hoy)
 *   - UI /admin/staff/nala/clientes (CRUD)
 *   - Tools de Nala (buscar cliente por RFC al procesar SPEI)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type Periodicidad = 'monthly' | 'biweekly' | 'weekly' | 'annual';
export type MetodoPago    = 'PUE' | 'PPD';

export interface ConceptoPlan {
  descripcion:    string;
  valor_unitario: number;
  cantidad?:      number;   // default 1
  con_iva?:       boolean;  // default true
}

export interface CentineliaCliente {
  id:                          string;
  rfc:                         string;
  razon_social:                string;
  cp:                          string;
  regimen_fiscal:              string;
  uso_cfdi_default:            string;
  correo_facturacion:          string;
  nombre_contacto:             string | null;
  activo:                      boolean;
  conceptos:                   ConceptoPlan[];
  periodicidad:                Periodicidad;
  fecha_proxima_facturacion:   string;   // ISO date (YYYY-MM-DD)
  fecha_ultima_facturacion:    string | null;
  metodo_pago_default:         MetodoPago;
  forma_pago_default:          string;
  stripe_customer_id:          string | null;
  notas:                       string | null;
  created_at:                  string;
  updated_at:                  string;
}

export interface CentineliaClienteInput {
  rfc:                         string;
  razon_social:                string;
  cp:                          string;
  regimen_fiscal?:             string;
  uso_cfdi_default?:           string;
  correo_facturacion:          string;
  nombre_contacto?:            string | null;
  activo?:                     boolean;
  conceptos:                   ConceptoPlan[];
  periodicidad?:               Periodicidad;
  fecha_proxima_facturacion:   string;
  metodo_pago_default?:        MetodoPago;
  forma_pago_default?:         string;
  stripe_customer_id?:         string | null;
  notas?:                      string | null;
}

const TABLE = 'centinelia_clientes';

export async function listClientes(supabase: SupabaseClient = createAdminClient()): Promise<CentineliaCliente[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('razon_social', { ascending: true });
  if (error) throw new Error(`listClientes: ${error.message}`);
  return (data ?? []) as CentineliaCliente[];
}

export async function getClienteById(id: string, supabase: SupabaseClient = createAdminClient()): Promise<CentineliaCliente | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getClienteById: ${error.message}`);
  return (data as CentineliaCliente | null) ?? null;
}

export async function getClienteByRfc(rfc: string, supabase: SupabaseClient = createAdminClient()): Promise<CentineliaCliente | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('rfc', rfc.toUpperCase().trim())
    .maybeSingle();
  if (error) throw new Error(`getClienteByRfc: ${error.message}`);
  return (data as CentineliaCliente | null) ?? null;
}

/**
 * Clientes activos con fecha_proxima_facturacion <= fechaCorte.
 * Usado por el cron nala-billing-cycle para saber qué facturar hoy.
 */
export async function getClientesPorFacturar(
  fechaCorte: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<CentineliaCliente[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('activo', true)
    .lte('fecha_proxima_facturacion', fechaCorte)
    .order('fecha_proxima_facturacion', { ascending: true });
  if (error) throw new Error(`getClientesPorFacturar: ${error.message}`);
  return (data ?? []) as CentineliaCliente[];
}

export async function createCliente(input: CentineliaClienteInput, supabase: SupabaseClient = createAdminClient()): Promise<CentineliaCliente> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...input,
      rfc: input.rfc.toUpperCase().trim(),
    })
    .select('*')
    .single();
  if (error) throw new Error(`createCliente: ${error.message}`);
  return data as CentineliaCliente;
}

export async function updateCliente(id: string, patch: Partial<CentineliaClienteInput>, supabase: SupabaseClient = createAdminClient()): Promise<CentineliaCliente> {
  const toUpdate = { ...patch };
  if (toUpdate.rfc) toUpdate.rfc = toUpdate.rfc.toUpperCase().trim();
  const { data, error } = await supabase
    .from(TABLE)
    .update(toUpdate)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateCliente: ${error.message}`);
  return data as CentineliaCliente;
}

export async function setActivo(id: string, activo: boolean, supabase: SupabaseClient = createAdminClient()): Promise<CentineliaCliente> {
  return updateCliente(id, { activo }, supabase);
}

/**
 * Después de emitir factura exitosa, avanza fecha_proxima_facturacion según
 * la periodicidad del cliente. Se llama desde el cron después del INSERT en
 * centinelia_billing.
 */
export function nextBillingDate(current: string, periodicidad: Periodicidad): string {
  const d = new Date(current + 'T00:00:00Z');
  switch (periodicidad) {
    case 'weekly':    d.setUTCDate(d.getUTCDate() + 7); break;
    case 'biweekly':  d.setUTCDate(d.getUTCDate() + 14); break;
    case 'monthly':   d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'annual':    d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Ciclo key para idempotencia en centinelia_billing. Formato:
 *   monthly:   '2026-09'
 *   biweekly:  '2026-09-Q1' o '2026-09-Q2' (día 1-15 vs 16-fin)
 *   weekly:    '2026-W36' (ISO week)
 *   annual:    '2026'
 */
export function cicloKey(fecha: string, periodicidad: Periodicidad): string {
  const d = new Date(fecha + 'T00:00:00Z');
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  switch (periodicidad) {
    case 'monthly':   return `${yyyy}-${mm}`;
    case 'biweekly':  return `${yyyy}-${mm}-Q${d.getUTCDate() <= 15 ? 1 : 2}`;
    case 'weekly': {
      // ISO week number
      const target = new Date(d.getTime());
      target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));
      const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
      const weekNumber = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
      return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
    }
    case 'annual':    return String(yyyy);
  }
}
