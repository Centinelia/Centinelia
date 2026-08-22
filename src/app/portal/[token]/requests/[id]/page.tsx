export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { ThemeProvider } from '@/components/ThemeProvider';
import PortalFooter from '../../PortalFooter';
import RespondForm from './RespondForm';

const URGENCY_META: Record<string, { label: string; fg: string; bg: string; border: string }> = {
  baja:  { label: 'Baja',  fg: '#6B6480', bg: 'rgba(107,100,128,0.08)',  border: 'rgba(107,100,128,0.25)' },
  media: { label: 'Media', fg: '#B45309', bg: 'rgba(245,158,11,0.10)',   border: 'rgba(245,158,11,0.30)' },
  alta:  { label: 'Alta',  fg: '#B91C1C', bg: 'rgba(239,68,68,0.10)',    border: 'rgba(239,68,68,0.30)'  },
};

interface Props { params: Promise<{ token: string; id: string }> }

export default async function RespondRequestPage({ params }: Props) {
  const { token, id } = await params;
  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; agent_name: string | null; business_name: string; portal_token: string }>(
    token,
    'id, agent_name, business_name, portal_token',
    supabase,
  );
  if (!agent) notFound();

  const { data: request } = await supabase
    .from('human_requests')
    .select('id, agent_id, request_type, title, description, urgency, source_context, source_inbox_id, target_email, status, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!request || request.agent_id !== agent.id) notFound();

  // Fetch original email context if exists
  let originalEmail: { from: string; subject: string; body: string } | null = null;
  if (request.source_inbox_id) {
    const { data: inbox } = await supabase
      .from('ops_inbox')
      .select('email_from, email_subject, email_body')
      .eq('id', request.source_inbox_id)
      .maybeSingle();
    if (inbox) originalEmail = {
      from:    (inbox.email_from as string) ?? '',
      subject: (inbox.email_subject as string) ?? '',
      body:    (inbox.email_body as string) ?? '',
    };
  }

  const urgency = URGENCY_META[request.urgency as string] ?? URGENCY_META.media;
  const createdAt = new Date(request.created_at as string);
  const dateLabel = createdAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeLabel = createdAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="flex flex-col" style={{ background: '#F5F2FB', minHeight: '100vh' }}>
        <div className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full flex flex-col gap-6">
          {/* Volver */}
          <Link
            href={`/portal/${token}/oficina/bandeja`}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold self-start transition-opacity hover:opacity-70"
            style={{ color: '#6C3BFF', textDecoration: 'none' }}
          >
            <ArrowLeft size={13} strokeWidth={2.25} />
            Volver a bandeja
          </Link>

          {/* Hero */}
          <header className="flex items-start gap-4 flex-wrap">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.25)' }}
            >
              <LifeBuoy size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
                Solicitud del empleado
              </p>
              <h1 className="text-[26px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
                {agent.agent_name ?? 'Tu empleado'} necesita tu ayuda
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: urgency.fg, background: urgency.bg, border: `1px solid ${urgency.border}` }}
                >
                  Urgencia {urgency.label}
                </span>
                <span className="text-[12px]" style={{ color: '#9B8FB5' }}>
                  {dateLabel} · {timeLabel}
                </span>
              </div>
            </div>
          </header>

          <RespondForm
            token={token}
            requestId={id}
            requestType={request.request_type as 'info' | 'action' | 'approval'}
            title={request.title as string}
            description={request.description as string}
            originalEmail={originalEmail}
            status={request.status as string}
          />
        </div>
        <PortalFooter />
      </div>
    </ThemeProvider>
  );
}
