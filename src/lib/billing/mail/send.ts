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
 * replyToInboundEmail: Task 5 implementation.
 *   - Looks up the original email row in billing_incoming_emails by emailId.
 *   - Constructs SMTP threading headers (In-Reply-To, References) from message_id.
 *   - Sends via sendBillingMail so all billing emails share the same formatting
 *     and transport path.
 */

import { sendEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';
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

// ── replyToInboundEmail ───────────────────────────────────────────────────────

/**
 * Replies to an inbound billing email preserving SMTP threading.
 *
 * Steps:
 *   1. Fetch the original billing_incoming_emails row by emailId.
 *   2. Build a BillingThreadRef from the stored message_id, if present.
 *   3. Send the reply via sendBillingMail with subject prefixed "Re: ".
 *
 * Throws if:
 *   - The emailId is not found in billing_incoming_emails.
 *   - sendBillingMail fails (delivery error).
 *
 * Threading notes:
 *   - In-Reply-To is set to the original Message-ID (angle-bracket wrapped).
 *   - References includes In-Reply-To (minimal — no prior References chain
 *     stored yet; sufficient for two-level threads in Gmail / Outlook).
 *   - If message_id is null (email arrived without a Message-ID header), the
 *     reply is sent without threading headers. This is logged at warning level.
 */
export async function replyToInboundEmail(
  emailId: string,
  body: string,
  attachments?: BillingAttachment[],
): Promise<MailSendResult> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('billing_incoming_emails')
    .select('from_address, subject, message_id')
    .eq('id', emailId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[billing/mail] replyToInboundEmail: DB lookup failed for emailId=${emailId}: ${error.message}`,
    );
  }

  if (!row) {
    throw new Error(
      `[billing/mail] replyToInboundEmail: no billing_incoming_emails row found for emailId=${emailId}`,
    );
  }

  const subject = row.subject
    ? (row.subject.startsWith('Re:') ? row.subject : `Re: ${row.subject}`)
    : 'Re: (sin asunto)';

  let threadRef: BillingThreadRef | undefined;
  if (row.message_id) {
    const mid = row.message_id.startsWith('<')
      ? row.message_id
      : `<${row.message_id}>`;
    threadRef = { messageId: mid };
  } else {
    console.warn(
      `[billing/mail] replyToInboundEmail: emailId=${emailId} has no message_id — sending without threading headers`,
    );
  }

  return sendBillingMail({
    to:          row.from_address,
    subject,
    body,
    attachments,
    threadRef,
  });
}
