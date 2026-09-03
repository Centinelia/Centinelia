/**
 * Cron endpoint — poll periódico de la bandeja Titan (hola@centinelia.mx),
 * clasifica cada correo unread, y si es fiscal deja que Nala lo procese +
 * responda desde Titan SMTP (para que aparezca en Enviados).
 *
 * Cadence recomendada: cada 5-10 min. Configurar en vercel.json:
 *   { "path": "/api/cron/nala-mailbox", "schedule": "*\/10 * * * *" }
 *
 * Auth: header Authorization: Bearer <CRON_SECRET>.
 *
 * Safety:
 *  - Solo procesa emails DIRIGIDOS a hola@centinelia.mx (verifica el `to`).
 *    Los forwards y CCs a otras direcciones se skipean.
 *  - Nunca marca como leído un email NO fiscal (Nazre lo ve normal en Titan).
 *  - Los fiscales se marcan como leídos SOLO tras respuesta exitosa.
 *  - Cap de 20 emails por corrida para evitar timeout de Vercel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchUnreadFromTitan, markSeenInTitan, getTitanConfig, type FetchedEmail } from '@/lib/email/titan-imap';
import { sendViaTitan } from '@/lib/email/titan-smtp';
import { processNalaEmail, type NalaEmailInput, type ReplySender } from '@/lib/ops/nala-email-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CENTINELIA_INBOX = (process.env.TITAN_EMAIL ?? 'hola@centinelia.mx').toLowerCase();

function isDirectedToNala(email: FetchedEmail): boolean {
  return email.to.some(addr => addr.toLowerCase() === CENTINELIA_INBOX);
}

async function parseAttachmentToText(a: FetchedEmail['attachments'][number]): Promise<{ name: string; text: string } | null> {
  const name = a.filename;
  // Text plano
  if (a.contentType.startsWith('text/') || /\.(txt|csv|xml)$/i.test(name)) {
    return { name, text: a.content.toString('utf8').slice(0, 8000) };
  }
  // PDF via unpdf (ya está en el proyecto)
  if (a.contentType === 'application/pdf' || /\.pdf$/i.test(name)) {
    try {
      const { extractText } = await import('unpdf');
      const { text } = await extractText(new Uint8Array(a.content), { mergePages: true });
      const joined = Array.isArray(text) ? text.join('\n') : text;
      return { name, text: joined.slice(0, 8000) };
    } catch {
      return { name, text: `[PDF ${a.size} bytes — parser falló]` };
    }
  }
  // Imágenes: no las leemos aquí (Nala LLM podría verlas via vision multi-modal
  // en una versión futura). Por ahora solo dejamos el nombre.
  if (a.contentType.startsWith('image/')) {
    return { name, text: `[imagen ${a.contentType} ${a.size} bytes — no parseado]` };
  }
  return { name, text: `[adjunto ${a.contentType} ${a.size} bytes — no parseado]` };
}

function buildTitanSender(): ReplySender {
  return async ({ to, subject, html, text, inReplyTo }) => {
    const result = await sendViaTitan({
      to, subject, html, text,
      inReplyTo,
      fromDisplay: 'Nala Centinelia',
    });
    if (!result.ok) console.warn('[nala-mailbox] sendViaTitan failed:', result.error);
    return result.ok;
  };
}

export async function GET(req: NextRequest) {
  // Auth cron
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const titanCfg = getTitanConfig();
  if (!titanCfg) {
    return NextResponse.json({ error: 'TITAN_APP_PASSWORD no configurado' }, { status: 500 });
  }

  let unread: FetchedEmail[];
  try {
    unread = await fetchUnreadFromTitan(titanCfg, { limit: 20 });
  } catch (e) {
    return NextResponse.json({ error: `Titan IMAP: ${(e as Error).message}` }, { status: 500 });
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    fetched: unread.length,
    directedToNala: 0,
    fiscal: 0,
    processed: 0,
    replied: 0,
    skippedNotDirected: 0,
    skippedNotFiscal: 0,
    errors: [] as Array<{ from: string; subject: string; error: string }>,
  };

  const uidsToMarkSeen: number[] = [];
  const sender = buildTitanSender();

  for (const email of unread) {
    // Solo procesamos si el correo va DIRIGIDO a hola@centinelia.mx
    // (no forwards, no CCs a otros). Nala no toca correos de otros.
    if (!isDirectedToNala(email)) {
      summary.skippedNotDirected++;
      continue;
    }
    summary.directedToNala++;

    // Parseo de adjuntos a texto (para que Nala tenga contexto de PDFs SPEI / constancias)
    const attachmentsText: NalaEmailInput['attachmentsText'] = [];
    for (const a of email.attachments) {
      const parsed = await parseAttachmentToText(a);
      if (parsed) attachmentsText.push(parsed);
    }

    let result;
    try {
      result = await processNalaEmail(
        {
          from:              email.from,
          subject:           email.subject,
          body:              email.bodyText || (email.bodyHtml ?? ''),
          attachmentsText,
          originalMessageId: email.messageId ?? undefined,
        },
        { sendReply: true, sender },
      );
    } catch (e) {
      summary.errors.push({ from: email.from, subject: email.subject, error: (e as Error).message });
      continue;
    }

    if (!result.fiscal) {
      // Nala no tocó — dejamos el correo unread para que Nazre lo vea normal en Titan
      summary.skippedNotFiscal++;
      continue;
    }

    summary.fiscal++;
    summary.processed++;
    if (result.replySent) {
      summary.replied++;
      // Marca como leído SOLO cuando respondió exitosamente
      uidsToMarkSeen.push(email.uid);
    } else {
      // Error en respuesta o timbrado — no marcamos como leído para reintentar
      summary.errors.push({
        from:    email.from,
        subject: email.subject,
        error:   'Nala procesó pero falló envío de respuesta',
      });
    }
  }

  if (uidsToMarkSeen.length > 0) {
    try {
      await markSeenInTitan(titanCfg, uidsToMarkSeen);
    } catch (e) {
      summary.errors.push({ from: 'markSeen', subject: '-', error: (e as Error).message });
    }
  }

  return NextResponse.json(summary);
}
