export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import OnboardingForm from './OnboardingForm';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function OnboardingPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: instance } = await supabase
    .from('onboarding_instances')
    .select('id, contact_name, status, submitted_at, agent_id, template_id, onboarding_templates(name, steps, document_requests, notes)')
    .eq('submit_token', token)
    .single();

  if (!instance) notFound();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, logo_url')
    .eq('id', instance.agent_id)
    .single();

  const template = (instance as any).onboarding_templates ?? {};

  return (
    <div className="min-h-screen" style={{ background: '#120726', color: '#e2e8f0', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#EDE8FF', padding: '20px 24px', textAlign: 'center', borderBottom: '1px solid rgba(108,59,255,0.15)' }}>
        {(agent as any)?.logo_url
          ? <img src={(agent as any).logo_url} alt={(agent as any)?.business_name ?? ''} style={{ height: 48, maxWidth: 200, objectFit: 'contain' }} />
          : <p style={{ fontWeight: 700, fontSize: 20, color: '#1A0A3B', margin: 0 }}>{(agent as any)?.business_name}</p>
        }
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px 64px' }}>
        {instance.status === 'completado' ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#e2e8f0' }}>¡Onboarding completado!</h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>Gracias, {instance.contact_name}. Hemos recibido tu información.</p>
          </div>
        ) : (
          <OnboardingForm
            submitToken={token}
            contactName={instance.contact_name as string}
            businessName={(agent as any)?.business_name ?? ''}
            templateName={template.name ?? ''}
            steps={(template.steps ?? []) as string[]}
            documentRequests={(template.document_requests ?? []) as string[]}
            notes={(template.notes ?? null) as string | null}
          />
        )}
      </div>
    </div>
  );
}
