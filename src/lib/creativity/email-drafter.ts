import type { createAdminClient } from '@/lib/supabase/admin';
import { shell, heading, mdToEmailHtml } from '@/lib/email/send';
import type { StructuredContent } from './content-generator';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface EmailDraftResult {
  ok:         true;
  subject:    string;
  html_body:  string;
  plain_body: string;
  message:    string;
}

export interface EmailDraftError { ok: false; error: string }

function toMarkdown(content: StructuredContent): string {
  const parts: string[] = [];
  for (const s of content.sections) {
    if (s.heading) parts.push(`### ${s.heading}`);
    if (s.body)    parts.push(s.body);
    if (s.bullets?.length) parts.push(s.bullets.map(b => `- ${b}`).join('\n'));
    parts.push('');
  }
  if (content.closing) parts.push(content.closing);
  return parts.join('\n').trim();
}

function toPlain(content: StructuredContent): string {
  const parts: string[] = [];
  for (const s of content.sections) {
    if (s.heading) parts.push(s.heading.toUpperCase());
    if (s.body)    parts.push(s.body);
    if (s.bullets?.length) parts.push(s.bullets.map(b => `• ${b}`).join('\n'));
    parts.push('');
  }
  if (content.closing) parts.push(content.closing);
  return parts.join('\n').trim();
}

export async function draftEmail(
  content: StructuredContent,
  agent: { id: string; agent_name: string | null },
  _supabase: SupabaseClient,
): Promise<EmailDraftResult | EmailDraftError> {
  const subject = (content.title || 'Mensaje').trim();

  const markdown = toMarkdown(content);
  const htmlBody = shell(heading(subject, `${agent.agent_name ?? 'Centinelia'}`) + mdToEmailHtml(markdown));
  const plainBody = toPlain(content);

  return {
    ok:         true,
    subject,
    html_body:  htmlBody,
    plain_body: plainBody,
    message:    `Borrador de correo listo (${subject}). Revisa antes de enviar.`,
  };
}
