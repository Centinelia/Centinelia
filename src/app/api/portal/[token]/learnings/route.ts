import { NextResponse } from 'next/server';
import { withPortalAuth } from '@/lib/portal/with-portal-auth';

export const GET = withPortalAuth(
  async (_req, { supabase, org }) => {
    const { data } = await supabase
      .from('agent_learnings')
      .select(`
        id, content, status, created_at, vapi_call_id, agent_id, source, confidence, category,
        voice_agents!agent_id(agent_name, business_name, role, features)
      `)
      .eq('portal_email', org.portalEmail)
      .order('created_at', { ascending: false })
      .limit(60);

    return NextResponse.json(data ?? []);
  },
  {
    requireModule: 'of_aprendizajes',
  },
);
