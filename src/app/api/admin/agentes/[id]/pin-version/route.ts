import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const pinnedVersion = body.pinned_version as number | null | undefined;

  if (pinnedVersion !== null && (typeof pinnedVersion !== 'number' || !Number.isInteger(pinnedVersion) || pinnedVersion < 1)) {
    return NextResponse.json({ error: 'pinned_version must be an integer >= 1, or null to unpin' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: agent, error: fetchErr } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  // Validar que la versión existe en el bundle para el meerkat del agente
  if (pinnedVersion !== null && pinnedVersion !== undefined) {
    const meerkatId = (agent.features as any)?.meerkat_role_id;
    if (!meerkatId) {
      return NextResponse.json({ error: 'Agent has no meerkat_role_id — cannot pin' }, { status: 400 });
    }
    const versions = MEERKAT_CONFIGS[meerkatId];
    if (!versions?.[pinnedVersion]) {
      return NextResponse.json({
        error: `Version ${pinnedVersion} does not exist for meerkat ${meerkatId}. Available: ${Object.keys(versions ?? {}).join(', ')}`,
      }, { status: 400 });
    }
  }

  // Merge features: null quita el pin
  const newFeatures = { ...(agent.features as Record<string, unknown>) };
  if (pinnedVersion === null) delete newFeatures.pinned_meerkat_version;
  else newFeatures.pinned_meerkat_version = pinnedVersion;

  const { error: updErr } = await supabase
    .from('voice_agents')
    .update({ features: newFeatures })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Resync a Vapi para que el assistant refleje la nueva versión inmediatamente
  if (agent.vapi_agent_id) {
    const { data: refreshed } = await supabase.from('voice_agents').select('*').eq('id', id).single();
    if (refreshed) {
      updateVapiAssistant(agent.vapi_agent_id, refreshed as VoiceAgent).catch(err => {
        console.error('[pin-version] resync failed', { id, error: err.message });
      });
    }
  }

  return NextResponse.json({ ok: true, features: newFeatures });
}
