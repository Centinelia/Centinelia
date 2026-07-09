// Receives inbound email via webhook from SendGrid Inbound Parse (or compatible service).
// Configure your provider to POST to:
//   https://www.centinelia.mx/api/email/inbound?secret=EMAIL_INBOUND_SECRET
// SendGrid: set MX record for EMAIL_INBOX_DOMAIN → mx.sendgrid.net
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveInboxToken, parseSenderName, parseToToken } from '@/lib/email/inbox';

interface StoredAttachment {
  name: string;
  url:  string;
  type: string;
  size: number;
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (process.env.EMAIL_INBOUND_SECRET && secret !== process.env.EMAIL_INBOUND_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  let to = '', from = '', subject = '', text = '';
  const rawAttachments: { name: string; buf: Buffer; type: string }[] = [];

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    to      = (form.get('to')      as string) ?? '';
    from    = (form.get('from')    as string) ?? '';
    subject = (form.get('subject') as string) ?? '';
    text    = (form.get('text')    as string) ?? '';

    const count = parseInt((form.get('attachments') as string) ?? '0', 10);
    for (let i = 1; i <= Math.min(count, 5); i++) {
      const file = form.get(`attachment${i}`) as File | null;
      if (!file || file.size > 10 * 1024 * 1024) continue; // skip files >10MB
      rawAttachments.push({
        name: file.name,
        buf:  Buffer.from(await file.arrayBuffer()),
        type: file.type || 'application/octet-stream',
      });
    }
  } else if (contentType.includes('application/json')) {
    const body = await req.json() as Record<string, string>;
    to      = body.to      ?? '';
    from    = body.from    ?? '';
    subject = body.subject ?? '';
    text    = body.text    ?? '';
  }

  const token = parseToToken(to);
  if (!token) return NextResponse.json({ ok: true });

  const portalEmail = await resolveInboxToken(token);
  if (!portalEmail) return NextResponse.json({ ok: true }); // unknown inbox, ignore

  const supabase = createAdminClient();

  // Find the first agent of this account to deliver to
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', portalEmail)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!agent) return NextResponse.json({ ok: true });

  // Store attachments in Supabase Storage
  const storedAttachments: StoredAttachment[] = [];
  const month = new Date().toISOString().slice(0, 7);
  for (const att of rawAttachments) {
    const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path     = `${portalEmail}/${month}/${Date.now()}-${safeName}`;
    const { data: stored } = await supabase.storage
      .from('email-attachments')
      .upload(path, att.buf, { contentType: att.type, upsert: false });

    if (stored?.path) {
      const { data: { publicUrl } } = supabase.storage
        .from('email-attachments')
        .getPublicUrl(stored.path);
      storedAttachments.push({
        name: att.name,
        url:  publicUrl,
        type: att.type,
        size: att.buf.length,
      });
    }
  }

  const senderName = parseSenderName(from);
  const preview    = text.trim().slice(0, 220);
  const content    = [
    subject ? `"${subject}"` : null,
    preview ? (preview.length < text.trim().length ? preview + '…' : preview) : null,
  ].filter(Boolean).join(' — ') || 'Correo sin cuerpo.';

  await supabase.from('agent_messages').insert({
    portal_email:  portalEmail,
    from_agent_id: null,
    to_agent_id:   agent.id,
    vapi_call_id:  null,
    type:          'email',
    content:       content.slice(0, 400),
    metadata: {
      from,
      from_name:        senderName,
      subject:          subject || null,
      attachment_count: storedAttachments.length,
      attachments:      storedAttachments,
    },
  });

  return NextResponse.json({ ok: true });
}
