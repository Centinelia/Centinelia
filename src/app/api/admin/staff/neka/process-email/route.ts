import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { processNekaEmail, classifyFiscalEmail, type NekaEmailInput } from '@/lib/ops/neka-email-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'admin only' }, { status: 401 });
  }

  const body = await req.json() as {
    from: string; subject: string; body: string;
    attachmentsText?: Array<{ name: string; text: string }>;
    sendReply?: boolean;
    classifyOnly?: boolean;
  };

  if (!body.from || !body.subject || !body.body) {
    return NextResponse.json({ error: 'from, subject y body son requeridos' }, { status: 400 });
  }

  const input: NekaEmailInput = {
    from:            body.from,
    subject:         body.subject,
    body:            body.body,
    attachmentsText: body.attachmentsText,
  };

  if (body.classifyOnly) {
    return NextResponse.json({ classification: classifyFiscalEmail(input) });
  }

  const result = await processNekaEmail(input, { sendReply: !!body.sendReply });
  return NextResponse.json(result);
}
