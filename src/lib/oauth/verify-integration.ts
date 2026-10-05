/**
 * verify-integration — helper para OAuth callbacks que escriben integraciones
 * en nuestra DB. Aplica la policy no-silent-provisioning-failures a OAuth
 * callbacks: si la escritura falla silenciosamente, el usuario ve "connected"
 * pero la integración no quedó registrada → feature broken sin aviso.
 *
 * Uso:
 *   const result = await verifyIntegrationUpsert({
 *     table:         'qb_integrations',
 *     portalEmail:   resolved.portalEmail,
 *     integrationLabel: 'QuickBooks',
 *     action: async () => {
 *       return supabase.from('qb_integrations').upsert({...}, { onConflict: ... });
 *     },
 *   });
 *   if (!result.ok) return NextResponse.redirect(toError('qb_db'));
 *
 * Side effects:
 *  - Logea error específico con contexto.
 *  - Si falla, dispara email URGENTE a hola@centinelia.mx via after() (no bloquea).
 */

import { after } from 'next/server';

export interface VerifyIntegrationArgs {
  /** Nombre lógico de la integración ("QuickBooks", "Gmail", "Instagram") — aparece en el email. */
  integrationLabel: string;
  /** portal_email del cliente afectado. Null = demo o sin resolver. */
  portalEmail:      string | null;
  /** Tabla objetivo (para logging). */
  table:            string;
  /** La operación que escribe a DB. Debe devolver (o resolver a) `{ error }`.
   *  Compatible con PostgrestBuilder de Supabase (que es thenable). */
  action:           () => PromiseLike<{ error: unknown }>;
}

export interface VerifyIntegrationResult {
  ok:    boolean;
  error: string | null;
}

export async function verifyIntegrationUpsert(args: VerifyIntegrationArgs): Promise<VerifyIntegrationResult> {
  let result: { error: unknown } | null = null;
  try {
    result = await Promise.resolve(args.action());
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[verify-integration] ${args.integrationLabel} upsert threw:`, err);
    scheduleAdminAlert(args, msg);
    return { ok: false, error: msg };
  }

  if (result?.error) {
    const err = result.error as { message?: string; code?: string };
    const msg = err.message ?? JSON.stringify(err);
    console.error(`[verify-integration] ${args.integrationLabel} upsert failed:`, err);
    scheduleAdminAlert(args, msg);
    return { ok: false, error: msg };
  }

  return { ok: true, error: null };
}

/**
 * Mandar email URGENTE a hola@centinelia.mx cuando una integración OAuth
 * falló al escribirse. Usa after() para no bloquear la respuesta del callback.
 * Si el send en sí falla, loguea pero no propaga.
 */
function scheduleAdminAlert(args: VerifyIntegrationArgs, errorMsg: string) {
  after(async () => {
    try {
      const { sendEmail } = await import('@/lib/email/send');
      await sendEmail({
        to:      'hola@centinelia.mx',
        subject: `[URGENTE] OAuth ${args.integrationLabel} falló al guardar — cliente ve "conectado" pero no está`,
        html:    `
          <p>El usuario completó OAuth de <strong>${args.integrationLabel}</strong> pero la escritura a <code>${args.table}</code> falló. El cliente ve pantalla de éxito pero la integración <strong>no está activa</strong>.</p>
          <ul>
            <li><strong>Cliente:</strong> ${args.portalEmail ?? '(sin portal_email)'}</li>
            <li><strong>Error:</strong> <code>${errorMsg.slice(0, 500)}</code></li>
            <li><strong>Hora:</strong> ${new Date().toISOString()}</li>
          </ul>
          <p>Pedir al cliente que reconecte, o investigar el error de Supabase. Ver policy no-silent-provisioning-failures.</p>
        `,
      });
    } catch (err) {
      console.error('[verify-integration] admin alert failed:', err);
    }
  });
}
