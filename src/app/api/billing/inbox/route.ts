/**
 * POST /api/billing/inbox
 *
 * Resend Inbound webhook for the billing empleado digital.
 * Configure Resend to POST to:
 *   https://www.centinelia.mx/api/billing/inbox?secret=EMAIL_INBOUND_SECRET
 *
 * Auth: ?secret= query param must match EMAIL_INBOUND_SECRET (same pattern as
 * the existing /api/email/inbound route — see src/app/api/email/inbound/route.ts).
 *
 * Payload: multipart/form-data (Resend Inbound format) OR application/json.
 * Attachments arrive as File objects in multipart; as base64 strings in JSON.
 *
 * Flow:
 *   1. Auth check (EMAIL_INBOUND_SECRET).
 *   2. Parse multipart/form-data or JSON body.
 *   3. Resolve organization by looking up integration where config->>inbox_email = to_address.
 *   4. Persist row in billing_incoming_emails.
 *   5. Enqueue billing job:
 *      - hasAttachments  -> 'process_notes'
 *      - no attachments  -> 'reply_missing_attachments'
 *   6. Return 200 (with attachments) or 202 (no attachments).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseInboundEmail } from '@/lib/billing/inbox/parse';
import { enqueueBillingEmail } from '@/lib/billing/employee/queue';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const configuredSecret = process.env.EMAIL_INBOUND_SECRET;
  if (!configuredSecret) {
    console.error('[billing/inbox] EMAIL_INBOUND_SECRET not set — rejecting');
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 503 });
  }
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== configuredSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // ── Parse payload ───────────────────────────────────────────────────────────
  const contentType = req.headers.get('content-type') ?? '';

  let rawFrom = '';
  let rawTo   = '';
  let rawSubject = '';
  let rawText    = '';
  let rawHeaders = '';
  const rawAttachments: { filename: string; contentType: string; content: Buffer }[] = [];

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    rawFrom    = (form.get('from')    as string) ?? '';
    rawTo      = (form.get('to')      as string) ?? '';
    rawSubject = (form.get('subject') as string) ?? '';
    rawText    = (form.get('text')    as string) ?? '';
    rawHeaders = (form.get('headers') as string) ?? '';

    const count = parseInt((form.get('attachments') as string) ?? '0', 10);
    for (let i = 1; i <= Math.min(count, 10); i++) {
      const file = form.get(`attachment${i}`) as File | null;
      if (!file || file.size === 0 || file.size > MAX_ATTACHMENT_SIZE) continue;
      rawAttachments.push({
        filename:    file.name,
        contentType: file.type || 'application/octet-stream',
        content:     Buffer.from(await file.arrayBuffer()),
      });
    }
  } else {
    // application/json (test path and fallback)
    const body = await req.json() as Record<string, unknown>;
    rawFrom    = (body.from    as string) ?? '';
    rawTo      = (body.to      as string) ?? '';
    rawSubject = (body.subject as string) ?? '';
    rawText    = (body.text    as string) ?? '';
    rawHeaders = (body.headers as string) ?? '';

    const jsonAttachments = (body.attachments as { filename: string; contentType: string; content: string }[] | undefined) ?? [];
    for (const att of jsonAttachments) {
      rawAttachments.push({
        filename:    att.filename,
        contentType: att.contentType,
        content:     Buffer.from(att.content, 'base64'),
      });
    }
  }

  // Normalised payload for parseInboundEmail
  const rawPayload = {
    from:        rawFrom,
    to:          rawTo,
    subject:     rawSubject,
    text:        rawText,
    headers:     rawHeaders,
    attachments: rawAttachments,
  };

  const parsed = parseInboundEmail(rawPayload);

  // ── Resolve org by inbox_email ──────────────────────────────────────────────
  const supabase = createAdminClient();

  const { data: integration, error: integrationErr } = await supabase
    .from('organization_integrations')
    .select('id, portal_email')
    .eq('config->>inbox_email', parsed.to)
    .maybeSingle();

  if (integrationErr) {
    console.error('[billing/inbox] integration lookup error:', integrationErr.message);
    return NextResponse.json({ ok: false, error: 'db_lookup_failed' }, { status: 500 });
  }

  if (!integration) {
    return NextResponse.json(
      { ok: false, error: 'no_integration_for_recipient' },
      { status: 404 },
    );
  }

  // ── Persist inbound email row ───────────────────────────────────────────────
  const { data: emailRow, error: insertErr } = await supabase
    .from('billing_incoming_emails')
    .insert({
      portal_email:    integration.portal_email,
      integration_id:  integration.id,
      from_address:    parsed.from,
      to_address:      parsed.to,
      subject:         parsed.subject || null,
      body_text:       parsed.text    || null,
      attachment_count: parsed.attachments.length,
      raw_payload:     rawPayload,
      message_id:      parsed.messageId,
    })
    .select('id')
    .single();

  if (insertErr || !emailRow) {
    console.error('[billing/inbox] insert error:', insertErr?.message);
    return NextResponse.json({ ok: false, error: 'db_insert_failed' }, { status: 500 });
  }

  // ── Enqueue job ─────────────────────────────────────────────────────────────
  const kind = parsed.hasAttachments ? 'process_notes' : 'reply_missing_attachments';

  const job = await enqueueBillingEmail({
    emailId:       emailRow.id as string,
    kind,
    portalEmail:   integration.portal_email as string,
    integrationId: integration.id as string,
  });

  if (!parsed.hasAttachments) {
    return NextResponse.json(
      { ok: true, jobId: job.jobId, warning: 'no_attachments' },
      { status: 202 },
    );
  }

  return NextResponse.json({ ok: true, jobId: job.jobId });
}
