/**
 * GET /api/cron/nala-writer-inbox
 *
 * Barre el inbox del Windows agent (billing-contpaqi-writer) para cada
 * integración de tipo `contpaqi` con Dropbox habilitado:
 *
 *   {basePath}/Importables_CONTPAQi/errores/*.json
 *     → BatchReport/FatalReport del writer.
 *     → Reply al cliente, redepositar en pendientes/, o escalar a Nazre
 *       según el `kind` de cada factura fallida.
 *     → El .json + .xml original se mueven a `errores/consumidos/`.
 *
 *   {basePath}/Importables_CONTPAQi/timbrados/*.xml
 *     → CFDI 4.0 timbrado listo para enviar al receptor.
 *     → Correlaciona basename → email_id via billing_activity_log (evento
 *       `invoice_submitted` insertado por el tool `submit_invoice_batch`).
 *     → Envía CFDI adjunto por correo threaded al remitente original.
 *     → Mueve a `timbrados/entregados/`.
 *
 * Idempotencia: los archivos que se consumen se mueven a subcarpetas de
 * "hechos" para no re-procesarse. Los que no encuentran correlación (kind
 * ok pero sin email_id todavía) se quedan y el siguiente tick los levanta.
 *
 * Cadence recomendada: cada 3-5 min (poll bajo latencia para el cliente
 * final que espera su factura). Configurar en vercel.json:
 *   { "path": "/api/cron/nala-writer-inbox", "schedule": "* /3 * * * *" }
 *
 * Auth: Bearer CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { DropboxClient } from '@/lib/billing/storage/dropbox';
import { decryptDropboxToken } from '@/lib/billing/adapters';
import { sendBillingMail, replyToInboundEmail } from '@/lib/billing/mail/send';
import { consumeErrores, consumeTimbrados, type ConsumeResult } from '@/lib/billing/writer-consumer/consume';
import { correlateBasenameToEmail } from '@/lib/billing/writer-consumer/correlate';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

// Directorio base absoluto por integración: {config.dropbox_base_path}/Importables_CONTPAQi.
// Default `/Facturacion` matchea con billing-retention y otros crons.
const DEFAULT_BASE = '/Facturacion';

interface IntegrationRow {
  id:           string;
  portal_email: string;
  config:       Record<string, unknown> | null;
}

interface PerOrgResult {
  portal_email: string;
  errores?:     ConsumeResult;
  timbrados?:   ConsumeResult;
  skipped?:     string;
  error?:       string;
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: rows, error: dbErr } = await supabase
    .from('organization_integrations')
    .select('id, portal_email, config')
    .eq('type', 'contpaqi')
    .not('config', 'is', null);

  if (dbErr) {
    console.error('[nala-writer-inbox] DB query error:', dbErr.message);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  const integrations = (rows ?? []) as IntegrationRow[];
  if (integrations.length === 0) {
    return NextResponse.json({ processed: 0, results: [] });
  }

  const results: PerOrgResult[] = [];
  for (const integ of integrations) {
    try {
      const one = await processIntegration(integ, supabase);
      results.push(one);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[nala-writer-inbox] error for', integ.portal_email, ':', msg);
      results.push({ portal_email: integ.portal_email, error: msg });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

async function processIntegration(
  integ: IntegrationRow,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<PerOrgResult> {
  const cfg   = integ.config ?? {};
  const token = decryptDropboxToken(cfg['dropbox_token'] as string | undefined)
              ?? process.env.BILLING_DROPBOX_TOKEN ?? '';
  const base  = ((cfg['dropbox_base_path'] as string | undefined) ?? DEFAULT_BASE).replace(/\/$/, '');

  if (!token) {
    return { portal_email: integ.portal_email, skipped: 'no_token' };
  }

  const dropbox    = new DropboxClient(token);
  const basePath   = `${base}/Importables_CONTPAQi`;
  const escalation = process.env.BILLING_ESCALATION_EMAIL;

  const log = (level: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => {
    console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](
      `[nala-writer-inbox] ${integ.portal_email} ${level}: ${msg}`,
      ctx ?? '',
    );
  };

  const erroresResult = await consumeErrores({
    dropbox, basePath, log,
    replyToClient: async (basename, action) => {
      const corr = await correlateBasenameToEmail(supabase, basename);
      if (!corr) {
        log('warn', 'sin correlación email_id, no puedo replicar al cliente. Escalo en su lugar.', {
          basename, kind: action.kind,
        });
        if (escalation) {
          await sendBillingMail({
            to: escalation,
            subject: `[Writer inbox] sin correlación para ${basename}`,
            body: `<p>El writer reportó error kind=<b>${action.kind}</b> pero no encontré el email origen.</p>
                   <p><b>Mensaje:</b> ${escapeHtml(action.humanMessage)}</p>`,
          });
        }
        return;
      }
      await replyToInboundEmail(corr.emailId, wrapClientReplyHtml(action.humanMessage, action.kind));
    },
    redepositPending: async (basename, action) => {
      // Re-depositar el XML original de errores/consumidos/ back to pendientes/.
      // No lo movemos aquí — el content-hash de Nala hace que sea idempotente:
      // si Nala vuelve a mandar el mismo XML, el writer lo procesará otra vez.
      // Por ahora solo dejamos log; retry lo dispara Nala en el siguiente ciclo.
      log('info', 'kind=pacError, marcado para retry en siguiente ciclo de Nala', {
        basename, reason: action.reason,
      });
    },
    escalate: async (basename, action) => {
      if (!escalation) return;
      await sendBillingMail({
        to: escalation,
        subject: `[Writer inbox] escalación kind=${action.kind} para ${basename}`,
        body: `<p><b>Portal:</b> ${integ.portal_email}</p>
               <p><b>Basename:</b> ${basename}</p>
               <p><b>Kind:</b> ${action.kind}</p>
               <p><b>Mensaje:</b> ${escapeHtml(action.humanMessage)}</p>`,
      });
    },
  });

  const timbradosResult = await consumeTimbrados({
    dropbox, basePath, log,
    deliverCfdi: async (basename, xmlContent) => {
      const corr = await correlateBasenameToEmail(supabase, basename);
      if (!corr) return false;
      await replyToInboundEmail(
        corr.emailId,
        wrapCfdiDeliveryHtml(),
        [{ filename: `${basename}.xml`, content: xmlContent }],
      );
      return true;
    },
  });

  return {
    portal_email: integ.portal_email,
    errores:      erroresResult,
    timbrados:    timbradosResult,
  };
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrapClientReplyHtml(humanMessage: string, kind: string): string {
  // Español, tono cliente-friendly. Sin em-dashes, sin mención a "IA/CONTPAQi"
  // cuando podamos evitarlo. Nala puede afinar más adelante con LLM.
  const intro = kind === 'rfcNotFound'
    ? '<p>Recibimos tu solicitud de factura, pero no pudimos procesarla porque el RFC no está en nuestro sistema todavía.</p>'
    : '<p>Recibimos tu solicitud de factura, pero necesitamos aclarar un detalle:</p>';
  return `${intro}
<blockquote>${escapeHtml(humanMessage)}</blockquote>
<p>Contáctanos con la información completa y la generamos enseguida.</p>`;
}

function wrapCfdiDeliveryHtml(): string {
  return `<p>Adjuntamos tu factura en formato XML (CFDI 4.0).</p>
<p>Guárdala junto con tus comprobantes. Si necesitas el PDF también, respóndenos y te lo mandamos.</p>`;
}
