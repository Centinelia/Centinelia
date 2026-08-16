import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { decryptString } from '@/lib/invoicing/csd-vault';
import { getProvider } from '@/lib/invoicing/registry';
import { sendEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Polls cfdi_cancellations with status='sent_to_sat' every 30 min.
// Uses claim_sat_cancellations_batch RPC (FOR UPDATE SKIP LOCKED) for
// idempotency under overlapping executions.
// See: migrations/20260812_claim_sat_cancellations_rpc.sql

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Atomic claim via RPC — reserves rows with a soft timestamp so a second
  // concurrent cron run skips them (sat_status_last_check is bumped to now()).
  const { data: candidates, error: rpcError } = await supabase.rpc(
    'claim_sat_cancellations_batch',
    { p_limit: 50 },
  );

  if (rpcError) {
    console.error('[poll-sat-cancellations] RPC error:', rpcError.message);
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const list = (
    candidates as Array<{
      id: string;
      uuid_cancelado: string;
      organization_email: string;
      factura_request_id: string;
    }>
  ) ?? [];

  const results = {
    checked: 0,
    accepted: 0,
    rejected: 0,
    pending: 0,
    expired: 0,
    errors: 0,
  };

  for (const cx of list) {
    results.checked++;
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('invoicing_provider, invoicing_credentials_encrypted, invoicing_test_mode')
        .eq('portal_email', cx.organization_email)
        .single();

      if (!org?.invoicing_credentials_encrypted) {
        console.warn('[poll-sat-cancellations] org sin credentials:', cx.organization_email);
        continue;
      }

      const provider = getProvider(org.invoicing_provider as string | null);
      if (!provider) {
        console.warn('[poll-sat-cancellations] PAC no soportado:', org.invoicing_provider);
        continue;
      }

      const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted as string));
      const testMode = (org.invoicing_test_mode as boolean | null) !== false;

      const status = await provider.consultarEstatusCancelacion(
        cx.uuid_cancelado,
        creds,
        { testMode },
      );

      if (status.status === 'accepted') {
        results.accepted++;

        let acusePath: string | null = null;
        if (status.acuseXml) {
          acusePath = `${cx.organization_email}/${cx.id}-acuse.xml`;
          await supabase.storage.from('cfdi-cancellations').upload(
            acusePath,
            status.acuseXml,
            { contentType: 'application/xml', upsert: true },
          );
        }

        await supabase
          .from('cfdi_cancellations')
          .update({
            status: 'accepted',
            sat_status_last_check: new Date().toISOString(),
            sat_acuse_xml_path: acusePath,
            notes: status.message ?? null,
          })
          .eq('id', cx.id);

        await supabase
          .from('factura_requests')
          .update({ status: 'cancelled' })
          .eq('id', cx.factura_request_id);

        void sendEmail({
          to: cx.organization_email,
          subject: `CFDI cancelado · ${cx.uuid_cancelado.slice(-8)}`,
          html: `<p>El SAT aceptó la cancelación del CFDI <strong>${cx.uuid_cancelado}</strong>.</p>`,
        });
      } else if (status.status === 'rejected') {
        results.rejected++;
        await supabase
          .from('cfdi_cancellations')
          .update({
            status: 'rejected',
            sat_status_last_check: new Date().toISOString(),
            notes: status.message ?? null,
          })
          .eq('id', cx.id);

        // Revert factura to stamped — cancellation was not accepted
        await supabase
          .from('factura_requests')
          .update({ status: 'stamped' })
          .eq('id', cx.factura_request_id);
      } else if (status.status === 'expired') {
        results.expired++;
        await supabase
          .from('cfdi_cancellations')
          .update({
            status: 'expired',
            sat_status_last_check: new Date().toISOString(),
            notes: status.message ?? null,
          })
          .eq('id', cx.id);

        await supabase
          .from('factura_requests')
          .update({ status: 'stamped' })
          .eq('id', cx.factura_request_id);
      } else {
        // Still pending — RPC already bumped sat_status_last_check as soft reserve.
        // The next poll (30 min later) will pick it up again after the interval elapses.
        results.pending++;
      }
    } catch (err) {
      results.errors++;
      console.error('[poll-sat-cancellations] row', cx.id, err);
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
