// src/lib/nox/brief-deliverer.ts
import { sendEmail, shell, heading, infoCard, mdToEmailHtml, agentBrandedFrom } from '@/lib/email/send';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { RenderedBrief } from './brief-renderer';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface DeliveryStatus {
  email:    'sent' | 'skipped' | 'error';
  wa:       'sent' | 'skipped' | 'error';
  portal:   'sent' | 'skipped' | 'error';
  brief_id: string | null;
}

interface DeliverAgent {
  id:                string;
  agent_name:        string | null;
  business_name:     string;
  client_email:      string | null;
  transfer_whatsapp: string | null;
  portal_email:      string;
  timezone:          string | null;
}

function markdownToWa(md: string): string {
  // WA no soporta markdown de headers/bullets bonito. Convertir a texto plano.
  return md
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/^_([^_]+)_$/gm, '$1')
    .replace(/^- /gm, '• ')
    .trim();
}

export async function deliverBrief(
  brief:    RenderedBrief,
  agent:    DeliverAgent,
  channels: { email: boolean; whatsapp: boolean; portal: boolean },
  trigger:  'cron' | 'reactive',
  supabase: SupabaseClient,
): Promise<DeliveryStatus> {
  const tz = agent.timezone ?? 'America/Monterrey';
  const dateStr = new Date().toLocaleDateString('es-MX', {
    timeZone: tz,
    weekday:  'long',
    day:      'numeric',
    month:    'long',
  });

  const status: DeliveryStatus = { email: 'skipped', wa: 'skipped', portal: 'skipped', brief_id: null };

  // Email
  if (channels.email && agent.client_email) {
    try {
      await sendEmail({
        to:      agent.client_email,
        from:    agentBrandedFrom(agent.agent_name),
        subject: `Brief del día · ${dateStr}`,
        html: shell(
          heading('Brief del día', `${agent.agent_name ?? 'Nox'} · ${dateStr}`) +
          infoCard(mdToEmailHtml(brief.markdown))
        ),
      });
      status.email = 'sent';
    } catch (err) {
      console.error('[brief-deliverer] email error:', err);
      status.email = 'error';
    }
  }

  // WhatsApp
  if (channels.whatsapp && agent.transfer_whatsapp) {
    try {
      const waBody = `*Brief del día · ${dateStr}*\n\n${markdownToWa(brief.markdown)}\n\nVer detalles en tu portal.`;
      const ok = await sendWhatsApp(agent.transfer_whatsapp, waBody);
      status.wa = ok ? 'sent' : 'error';
    } catch (err) {
      console.error('[brief-deliverer] wa error:', err);
      status.wa = 'error';
    }
  }

  // Portal DB (siempre insert salvo channels.portal=false en modo reactive)
  const shouldInsert = trigger === 'cron' || channels.portal;
  if (shouldInsert) {
    try {
      const { data, error } = await supabase.from('brief_runs').insert({
        agent_id:        agent.id,
        portal_email:    agent.portal_email,
        trigger,
        brief_md:        brief.markdown,
        buckets_json:    brief.buckets,
        delivery_status: { email: status.email, wa: status.wa },
      }).select('id').single();
      if (error) throw error;
      status.brief_id = (data as { id: string } | null)?.id ?? null;
      status.portal = 'sent';
    } catch (err) {
      console.error('[brief-deliverer] portal insert error:', err);
      status.portal = 'error';
    }
  }

  return status;
}
