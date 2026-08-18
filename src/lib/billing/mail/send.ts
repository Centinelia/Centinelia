/**
 * billing/mail/send.ts
 *
 * Outbound mail helper for the billing empleado digital.
 *
 * Wraps the existing sendEmail helper (src/lib/email/send.ts) which talks to
 * Resend over fetch. Adds:
 *   - typed BillingAttachment (filename + content as Buffer or base64 string)
 *   - optional threadRef for SMTP threading (In-Reply-To / References)
 *   - configurable from address (default: BILLING_FROM_EMAIL env var, then
 *     a sensible pilot default)
 *   - a messageId returned on success (Resend does not expose the Message-ID
 *     it assigns in the boolean-return helper, so we generate a deterministic
 *     token locally — sufficient for Tasks 8, 10, 11 that need a reference)
 *
 * replyToInboundEmail is a STUB pending Task 5, which creates the
 * billing_incoming_emails table. It logs a warning and returns a dummy
 * messageId so callers can be wired up without blocking on Task 5.
 *
 * Design decision (documented in task-14-report.md):
 *   replyToInboundEmail is intentionally incomplete here. Moving it to Task 5
 *   avoids a dependency on a table that does not yet exist, keeps zero-debt
 *   within Task 14's scope, and gives Task 5 a clear integration target.
 */

import { sendEmail } from '@/lib/email/send';
import { randomUUID } from 'crypto';

// ── Default from address ──────────────────────────────────────────────────────

const BILLING_FROM =
  process.env.BILLING_FROM_EMAIL ??
  'Facturacion Centinelia <facturacion@tortilleria.centinelia.ai>';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BillingAttachment {
  filename: string;
  /** base64-encoded string or raw Buffer. Resend accepts both. */
  content: string | Buffer;
}

export interface BillingThreadRef {
  /** Message-ID of the email being replied to, including angle brackets. */
  messageId: string;
  /** Prior Message-IDs in the thread (oldest first). Optional. */
  references?: string[];
}

export interface SendBillingMailOpts {
  to: string;
  subject: string;
  /** HTML body of the email. */
  body: string;
  /** Override the default from address. */
  from?: string;
  /** Reply-To header value. */
  replyTo?: string;
  /** Attachments to include. */
  attachments?: BillingAttachment[];
  /** Threading context. Sets In-Reply-To and References headers. */
  threadRef?: BillingThreadRef;
}

export interface MailSendResult {
  messageId: string;
}

// ── sendBillingMail ───────────────────────────────────────────────────────────

/**
 * Sends an outbound billing email via Resend.
 *
 * Returns { messageId } on success. Throws on delivery failure (sendEmail
 * returns false) or network/API errors.
 */
export async function sendBillingMail(
  opts: SendBillingMailOpts,
): Promise<MailSendResult> {
  const headers: Record<string, string> | undefined = opts.threadRef
    ? buildThreadHeaders(opts.threadRef)
    : undefined;

  // Map BillingAttachment to the shape sendEmail expects.
  // Buffer.toString('base64') returns string; the conditional ternary is already
  // string in both branches — cast to satisfy tsc's union inference.
  const attachments: { filename: string; content: string }[] | undefined =
    opts.attachments?.map((a) => ({
      filename: a.filename,
      content: (
        a.content instanceof Buffer
          ? a.content.toString('base64')
          : a.content
      ) as string,
    }));

  const ok = await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.body,
    from: opts.from ?? BILLING_FROM,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    ...(attachments?.length ? { attachments } : {}),
    ...(headers ? { headers } : {}),
  });

  if (!ok) {
    throw new Error(
      `sendBillingMail: delivery failed for ${opts.to} / "${opts.subject}"`,
    );
  }

  return { messageId: `<billing-${randomUUID()}@centinelia.internal>` };
}

// ── Threading helpers ─────────────────────────────────────────────────────────

function buildThreadHeaders(ref: BillingThreadRef): Record<string, string> {
  const allRefs = [...(ref.references ?? []), ref.messageId];
  return {
    'In-Reply-To': ref.messageId,
    References: allRefs.join(' '),
  };
}

// ── replyToInboundEmail — STUB (Task 5 pending) ───────────────────────────────

/**
 * STUB: replies to an inbound email preserving SMTP threading.
 *
 * Full implementation requires the billing_incoming_emails table (Task 5).
 * Until Task 5 lands this function:
 *   1. Logs a warning so operators know the stub is active.
 *   2. Returns a dummy messageId so callers can compile and run.
 *
 * Task 5 should replace this body with:
 *   - SELECT Message-ID from billing_incoming_emails WHERE id = emailId
 *   - Call sendBillingMail with threadRef set from that row
 */
export async function replyToInboundEmail(
  emailId: string,
  body: string,
  attachments?: BillingAttachment[],
): Promise<MailSendResult> {
  console.warn(
    '[billing/mail] replyToInboundEmail: billing_incoming_emails not yet migrated ' +
      '(Task 5 pending). emailId=' +
      emailId +
      ' — returning dummy messageId. body.length=' +
      body.length +
      (attachments ? ' attachments=' + attachments.length : ''),
  );
  return { messageId: `<stub-reply-${randomUUID()}@centinelia.internal>` };
}
