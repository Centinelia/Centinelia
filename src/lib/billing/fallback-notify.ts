import { sendWhatsApp } from '@/lib/whatsapp/send';
import { maskPhoneNumber } from './fallback-validate';
import type { createAdminClient } from '@/lib/supabase/admin';

type SB = ReturnType<typeof createAdminClient>;

export interface FallbackOrg {
  portal_email: string;
  fallback_phone_number: string;
  fallback_notified_at: string | null;
  minutes_reset_date?: string | null;
  transfer_whatsapp?: string | null;
  guardia_principal?: string | null;
}

function shouldNotify(org: FallbackOrg): boolean {
  if (!org.fallback_notified_at) return true;
  const notifiedAt = new Date(org.fallback_notified_at).getTime();
  const cycleStart = org.minutes_reset_date
    ? new Date(org.minutes_reset_date).getTime() - 30 * 24 * 60 * 60 * 1000
    : Date.now() - 30 * 24 * 60 * 60 * 1000;
  return notifiedAt < cycleStart;
}

function resolveDestination(org: FallbackOrg): string | null {
  return org.guardia_principal || org.transfer_whatsapp || null;
}

export async function notifyFallbackActivated(
  supabase: SB,
  org: FallbackOrg,
  agentName: string,
  portalUrl: string,
): Promise<void> {
  if (!shouldNotify(org)) return;
  const to = resolveDestination(org);
  if (!to) return;

  // El pool de minutos es org-level, no per-agente. Antes decía "minutos de
  // ${agentName}" — cliente en org multi-empleado pensaba "solo Nia" cuando
  // en realidad TODOS los empleados de voz están pausados.
  void agentName;
  const body =
    `Se agotaron los minutos del pool de tu oficina este ciclo — todos tus empleados de voz están pausados. ` +
    `Las llamadas entrantes van a ${maskPhoneNumber(org.fallback_phone_number)} hasta que recargues. Las tareas de oficina siguen funcionando. ` +
    `Recarga aquí: ${portalUrl}/facturacion`;

  try {
    const ok = await sendWhatsApp(to, body);
    if (ok) {
      await supabase
        .from('organizations')
        .update({ fallback_notified_at: new Date().toISOString() })
        .eq('portal_email', org.portal_email);
    }
  } catch (err) {
    console.warn('[fallback-notify] activated failed:', (err as Error).message);
  }
}

export async function notifyFallbackRestored(
  supabase: SB,
  org: FallbackOrg,
  agentName: string,
): Promise<void> {
  const to = resolveDestination(org);
  if (!to) return;
  // El pool es org-level: cuando recarga, todos los empleados vuelven, no
  // solo el que dio nombre a la notificación anterior.
  void agentName;
  try {
    await sendWhatsApp(to, `Recargado. Las llamadas entrantes vuelven a tu oficina normalmente.`);
  } catch (err) {
    console.warn('[fallback-notify] restored failed:', (err as Error).message);
  }
}
