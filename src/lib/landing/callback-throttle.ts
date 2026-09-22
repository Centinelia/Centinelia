// Rate limiter para solicitudes de callback desde la landing.
//
// Reglas:
//   - Maxima 3 solicitudes por IP en 10 minutos
//   - Maxima 2 solicitudes por telefono en 1 hora
//
// Usa el cliente admin para leer landing_callback_requests sin pasar por RLS.
// Solo se llama desde rutas de servidor.

import { createAdminClient } from '@/lib/supabase/admin';

const IP_WINDOW_MIN = 10;
const IP_MAX        = 3;
const PHONE_WINDOW_MIN = 60;
const PHONE_MAX        = 2;

export async function checkThrottle(input: {
  ip:    string | null;
  phone: string;
}): Promise<{ allowed: boolean; reason?: 'ip_rate_limit' | 'phone_rate_limit' }> {
  const supabase = createAdminClient();

  // Verificar limite por IP (solo si la IP esta disponible)
  if (input.ip) {
    const ipSince = new Date(Date.now() - IP_WINDOW_MIN * 60_000).toISOString();
    const { count: ipCount } = await supabase
      .from('landing_callback_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip', input.ip)
      .gte('created_at', ipSince);

    if ((ipCount ?? 0) >= IP_MAX) {
      return { allowed: false, reason: 'ip_rate_limit' };
    }
  }

  // Verificar limite por telefono
  const phoneSince = new Date(Date.now() - PHONE_WINDOW_MIN * 60_000).toISOString();
  const { count: phoneCount } = await supabase
    .from('landing_callback_requests')
    .select('id', { count: 'exact', head: true })
    .eq('phone', input.phone)
    .gte('created_at', phoneSince);

  if ((phoneCount ?? 0) >= PHONE_MAX) {
    return { allowed: false, reason: 'phone_rate_limit' };
  }

  return { allowed: true };
}
