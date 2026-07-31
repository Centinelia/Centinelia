import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { clearMeerkatVersionCache } from '@/lib/vapi/resolve-meerkat';
import { resyncAgentsByMeerkat } from '@/lib/vapi/resync-meerkat';

async function currentAdminEmail(): Promise<{ ok: boolean; email?: string }> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  if (secret !== process.env.ADMIN_SECRET) return { ok: false };
  // Admin panel no tiene sesión individual — usar 'admin@centinelia.mx' como marker.
  return { ok: true, email: 'admin@centinelia.mx' };
}

interface Params { params: Promise<{ meerkat: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await currentAdminEmail();
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const body = await req.json().catch(() => ({}));
  const {
    version,
    reason,
    override_reason,
    gate_verdict,
  } = body as {
    version?: number;
    reason?: string;
    override_reason?: string;
    gate_verdict?: 'pass' | 'warn' | 'fail' | 'incomplete';
  };

  if ((gate_verdict === 'fail' || gate_verdict === 'incomplete') && !override_reason?.trim()) {
    return NextResponse.json({
      error: `override_reason is required when gate_verdict is '${gate_verdict}'`,
    }, { status: 400 });
  }

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
  }

  // Validar que la versión existe en el bundle
  const versionsInCode = MEERKAT_CONFIGS[meerkat];
  if (!versionsInCode) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!versionsInCode[version]) {
    return NextResponse.json({
      error: `Version ${version} does not exist in code for ${meerkat}. Available: ${Object.keys(versionsInCode).join(', ')}`,
    }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Read current active version (para history from_version)
  const { data: current } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkat)
    .maybeSingle();

  const currentVersion = current?.active_version ?? null;

  // No-op si ya está en esa versión (evitar history duplicado)
  if (currentVersion === version) {
    return NextResponse.json({ ok: true, noop: true, message: `Already active on v${version}` });
  }

  // Determinar reason automático si no viene
  const finalReason = reason ?? (currentVersion != null && version < currentVersion ? 'rollback' : 'rollout');

  // Transacción implícita: history primero, luego UPDATE active_versions.
  const historyReason = override_reason?.trim()
    ? `[OVERRIDE:${gate_verdict}] ${override_reason.trim()}${reason ? ` — ${reason}` : ''}`
    : (reason ?? finalReason);

  const { error: histErr } = await supabase.from('meerkat_version_history').insert({
    meerkat_id: meerkat,
    from_version: currentVersion,
    to_version: version,
    changed_by: auth.email,
    reason: historyReason,
  });
  if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 });

  const { error: updErr } = await supabase
    .from('meerkat_active_versions')
    .update({
      active_version: version,
      activated_at: new Date().toISOString(),
      activated_by: auth.email,
      notes: reason ?? null,
    })
    .eq('meerkat_id', meerkat);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Invalidar cache local (esta instancia). Otras instancias esperan 60s TTL.
  clearMeerkatVersionCache();

  // Fire-and-forget resync a Vapi. No bloquea la response.
  resyncAgentsByMeerkat(meerkat).then(result => {
    console.log('[activate] resync complete', { meerkat, version, ...result });
  }).catch((err: Error) => {
    console.error('[activate] resync failed', { meerkat, version, error: err.message });
  });

  return NextResponse.json({
    ok: true,
    meerkat,
    from_version: currentVersion,
    to_version: version,
    reason: finalReason,
    message: `${meerkat} v${version} activated. Resync in progress.`,
  });
}
