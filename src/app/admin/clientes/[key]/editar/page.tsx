import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import ClientEditForm from './ClientEditForm';
import type { VoiceAgent } from '@/types/agent';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ key: string }>;
}

export default async function EditarClientePage({ params }: Props) {
  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  const supabase = createAdminClient();

  const isEmail = decodedKey.includes('@');

  // Fetch all voice_agents rows for this client. select('*') no falla por dropped columns.
  let query = supabase.from('voice_agents').select('*');
  query = isEmail
    ? query.eq('portal_email', decodedKey.toLowerCase().trim())
    : query.eq('client_name', decodedKey);

  const { data: agentsRaw } = await query;
  const agents = (agentsRaw ?? []) as VoiceAgent[];
  if (agents.length === 0) notFound();

  // Traer campos org-level (business_website, business_hours) desde organizations
  const portalEmail = agents[0].portal_email ?? null;
  let orgData: { business_website?: string | null; business_hours?: unknown } | null = null;
  if (portalEmail) {
    const { data } = await supabase
      .from('organizations')
      .select('business_website, business_hours')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    orgData = data as any;
  }

  return (
    <ClientEditForm
      routeKey={key}
      agents={agents}
      orgBusinessWebsite={(orgData?.business_website as string) ?? null}
      orgBusinessHours={(orgData?.business_hours as any) ?? null}
    />
  );
}
