export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ThemeProvider } from '@/components/ThemeProvider';
import PortalFooter from '../../PortalFooter';
import RespondForm from './RespondForm';

interface Props { params: Promise<{ token: string; id: string }> }

export default async function RespondRequestPage({ params }: Props) {
  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_token')
    .eq('portal_token', token)
    .maybeSingle();
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

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div style={{ background: 'var(--c-bg-1)', minHeight: '100vh' }}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <a href={`/portal/${token}/oficina/bandeja`} className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            &larr; Volver a bandeja
          </a>
          <h1 className="text-xl font-bold mt-3 mb-1" style={{ color: 'var(--c-text)' }}>
            {agent.agent_name} necesita tu ayuda
          </h1>
          <p className="text-xs mb-6" style={{ color: 'var(--c-text-3)' }}>
            urgencia: {request.urgency} &middot; {new Date(request.created_at as string).toLocaleString('es-MX')}
          </p>
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
