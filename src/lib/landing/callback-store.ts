// Modulo CRUD para landing_callback_requests.
// Usa el cliente admin (service role) para bypasear RLS — solo se llama desde
// rutas de servidor (API routes / Server Actions), nunca desde el cliente.

import { createAdminClient } from '@/lib/supabase/admin';

export type CallStatus =
  | 'pending'
  | 'dialing'
  | 'answered'
  | 'completed'
  | 'failed'
  | 'fallback_manual';

export interface CallbackRequest {
  id:               string;
  phone:            string;
  // Legacy — se mantiene nullable durante migración a contexto dinámico. Row nuevas
  // usan org_name/org_description/expectation en su lugar.
  industry:         string | null;
  org_name:         string | null;
  org_description:  string | null;
  expectation:      string | null;
  ip:               string | null;
  user_agent:       string | null;
  consent_at:       string;
  otp_hash:         string | null;
  otp_expires_at:   string | null;
  otp_attempts:     number;
  otp_verified_at:  string | null;
  vapi_call_id:     string | null;
  call_status:      CallStatus | null;
  call_started_at:  string | null;
  call_ended_at:    string | null;
  created_at:       string;
  updated_at:       string;
}

// Inserta una nueva solicitud de callback con contexto dinámico del demo.
// Retorna el id generado.
export async function createRequest(input: {
  phone:           string;
  orgName:         string;
  orgDescription:  string;
  expectation:     string;
  ip:              string | null;
  userAgent:       string | null;
}): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('landing_callback_requests')
    .insert({
      phone:           input.phone,
      // La columna `industry` sigue existiendo y es NOT NULL en la tabla original;
      // usamos 'custom_demo' como marker para rows del nuevo flow dinámico.
      industry:        'custom_demo',
      org_name:        input.orgName,
      org_description: input.orgDescription,
      expectation:     input.expectation,
      ip:              input.ip,
      user_agent:      input.userAgent,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`createRequest fallo: ${error?.message}`);
  }
  return { id: data.id };
}

// Guarda el hash bcrypt del OTP y su fecha de expiracion.
export async function setOtpHash(
  id: string,
  hash: string,
  expiresAt: Date,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('landing_callback_requests')
    .update({
      otp_hash:       hash,
      otp_expires_at: expiresAt.toISOString(),
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`setOtpHash fallo: ${error.message}`);
}

// Incrementa otp_attempts de forma atomica via RPC. Retorna el nuevo valor.
export async function incrementOtpAttempts(id: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .rpc('increment_otp_attempts', { req_id: id });
  if (error) throw new Error(`incrementOtpAttempts fallo: ${error.message}`);
  return data as number;
}

// Marca el OTP como verificado (timestamp de verificacion).
export async function markOtpVerified(id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('landing_callback_requests')
    .update({
      otp_verified_at: new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`markOtpVerified fallo: ${error.message}`);
}

// Guarda el id de la llamada Vapi y su estado inicial.
export async function setVapiCall(
  id: string,
  vapiCallId: string,
  status: CallStatus,
): Promise<void> {
  const { error } = await createAdminClient()
    .from('landing_callback_requests')
    .update({
      vapi_call_id:    vapiCallId,
      call_status:     status,
      call_started_at: new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`setVapiCall fallo: ${error.message}`);
}

// Lee una solicitud por su id. Retorna null si no existe.
export async function getById(id: string): Promise<CallbackRequest | null> {
  const { data, error } = await createAdminClient()
    .from('landing_callback_requests')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as CallbackRequest;
}
