// scripts/run-nala-mailbox.ts — dispara el cron nala-mailbox directo
// bypasseando el HTTP endpoint (útil cuando el dev server no corre).
//
// USO: npx tsx scripts/run-nala-mailbox.ts

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { fetchUnreadFromTitan, markSeenInTitan, getTitanConfig, type FetchedEmail } from '../src/lib/email/titan-imap';
import { sendViaTitan } from '../src/lib/email/titan-smtp';
import { processNalaEmail, type NalaEmailInput, type ReplySender } from '../src/lib/ops/nala-email-runner';

const CENTINELIA_INBOX = (process.env.TITAN_EMAIL ?? 'hola@centinelia.mx').toLowerCase();

function isDirectedToNala(email: FetchedEmail): boolean {
  return email.to.some(addr => addr.toLowerCase() === CENTINELIA_INBOX);
}

async function parseAttachmentToText(a: FetchedEmail['attachments'][number]): Promise<{ name: string; text: string } | null> {
  const name = a.filename;
  if (a.contentType.startsWith('text/') || /\.(txt|csv|xml)$/i.test(name)) {
    return { name, text: a.content.toString('utf8').slice(0, 8000) };
  }
  if (a.contentType === 'application/pdf' || /\.pdf$/i.test(name)) {
    try {
      const { extractText } = await import('unpdf');
      const { text } = await extractText(new Uint8Array(a.content), { mergePages: true });
      const joined = Array.isArray(text) ? text.join('\n') : text;
      return { name, text: joined.slice(0, 8000) };
    } catch {
      return { name, text: `[PDF ${a.size} bytes]` };
    }
  }
  if (a.contentType.startsWith('image/')) {
    return { name, text: `[imagen ${a.contentType} ${a.size} bytes]` };
  }
  return { name, text: `[${a.contentType} ${a.size} bytes]` };
}

function buildTitanSender(): ReplySender {
  return async ({ to, subject, html, text, inReplyTo }) => {
    const result = await sendViaTitan({
      to, subject, html, text, inReplyTo,
      fromDisplay: 'Nala Centinelia',
    });
    if (!result.ok) console.warn('  [sendViaTitan]', result.error);
    return result.ok;
  };
}

async function main() {
  const titanCfg = getTitanConfig();
  if (!titanCfg) {
    console.error('TITAN_APP_PASSWORD no configurado');
    process.exit(1);
  }

  console.log(`Nala mailbox check @ ${new Date().toISOString()}`);
  console.log('');

  console.log('1. Fetch unread de Titan...');
  const unread = await fetchUnreadFromTitan(titanCfg, { limit: 20 });
  console.log(`   ${unread.length} unread`);

  if (unread.length === 0) {
    console.log('No hay correos nuevos.');
    return;
  }

  const sender = buildTitanSender();
  const uidsToMarkSeen: number[] = [];

  for (const email of unread) {
    console.log('');
    console.log(`─── UID ${email.uid} ───`);
    console.log(`   De:      ${email.fromName ?? ''} <${email.from}>`);
    console.log(`   Para:    ${email.to.join(', ')}`);
    console.log(`   Asunto:  ${email.subject}`);
    console.log(`   Cuerpo:  ${email.bodyText.slice(0, 150).replace(/\n/g, ' ')}${email.bodyText.length > 150 ? '...' : ''}`);
    console.log(`   Adjunt:  ${email.attachments.length}`);

    if (!isDirectedToNala(email)) {
      console.log('   → SKIP (no dirigido a hola@centinelia.mx)');
      continue;
    }

    // Parse attachments
    const attachmentsText: NalaEmailInput['attachmentsText'] = [];
    for (const a of email.attachments) {
      const parsed = await parseAttachmentToText(a);
      if (parsed) attachmentsText.push(parsed);
    }

    console.log('   → procesando con Nala...');
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
      console.log(`   ✗ Excepción: ${(e as Error).message}`);
      continue;
    }

    console.log(`   Clasificación: ${result.classifyResult.fiscal ? 'FISCAL' : 'NO FISCAL'} (${result.classifyResult.confidence}) — ${result.classifyResult.reason}`);
    if (!result.fiscal) {
      console.log('   → skip, no fiscal (unread se queda)');
      continue;
    }

    console.log(`   Eventos: ${result.events?.length ?? 0}`);
    for (const ev of result.events ?? []) {
      if (ev.kind === 'text') {
        console.log(`     [text] ${ev.text.slice(0, 100)}${ev.text.length > 100 ? '...' : ''}`);
      } else if (ev.kind === 'tool_call') {
        console.log(`     [call] ${ev.name}`);
      } else if (ev.kind === 'tool_result') {
        const r = ev.result as { ok?: boolean; uuid?: string; error?: string; message?: string };
        console.log(`     [result] ${ev.name} → ${r.ok ? `OK ${r.uuid ?? ''}` : `FAIL ${r.error ?? ''}`}`);
      } else if (ev.kind === 'error') {
        console.log(`     [error] ${ev.error}`);
      }
    }

    if (result.replySent) {
      console.log('   ✓ Respuesta enviada vía Titan SMTP');
      uidsToMarkSeen.push(email.uid);
    } else {
      console.log('   ✗ Respuesta NO enviada (unread se queda para reintento)');
    }
  }

  if (uidsToMarkSeen.length > 0) {
    console.log('');
    console.log(`Marcando ${uidsToMarkSeen.length} como leídos...`);
    await markSeenInTitan(titanCfg, uidsToMarkSeen);
    console.log('OK');
  }
}

main().catch(err => {
  console.error('Unhandled:', err);
  process.exit(1);
});
