import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { clearMeerkatVersionCache } from '@/lib/vapi/resolve-meerkat';
import { resyncAgentsByMeerkat } from '@/lib/vapi/resync-meerkat';
import { MEERKAT_IDS, type MeerkatId } from '@/lib/golden-tests/types';
import { computeGateVerdict } from '@/lib/golden-tests/gate';
import { invalidateFlagCache } from '@/lib/feature-flags/evaluator';
import { writeFlagAudit } from '@/lib/feature-flags/audit';

async function currentAdminEmail(): Promise<{ ok: boolean; email?: string }> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  if (secret !== process.env.ADMIN_SECRET) return { ok: false };
  return { ok: true, email: 'admin@centinelia.mx' };
}

interface Params { params: Promise<{ meerkat: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await currentAdminEmail();
  if (!auth.ok || !auth.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const body = await req.json().catch(() => ({}));
  const {
    version,
    reason,
    override_reason,
    initial_pct: initialPctRaw,
    allowlist: allowlistRaw,
    gate_verdict: client_gate_verdict,
  } = body as {
    version?: number;
    reason?: string;
    override_reason?: string;
    initial_pct?: number;
    allowlist?: string[];
    gate_verdict?: string;
  };

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
  }

  const versionsInCode = MEERKAT_CONFIGS[meerkat];
  if (!versionsInCode) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!versionsInCode[version]) {
    return NextResponse.json({
      error: `Version ${version} does not exist in code for ${meerkat}. Available: ${Object.keys(versionsInCode).join(', ')}`,
    }, { status: 400 });
  }

  const initialPct = typeof initialPctRaw === 'number' && initialPctRaw >= 0 && initialPctRaw <= 100
    ? Math.round(initialPctRaw)
    : 10;
  const allowlist = Array.isArray(allowlistRaw) ? allowlistRaw.map(String) : [];

  const supabase = createAdminClient();

  // Read current active version para history from_version (mantener continuidad con UI actual).
  const { data: current } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkat)
    .maybeSingle();
  const currentVersion = current?.active_version ?? null;

  if (currentVersion === version) {
    return NextResponse.json({ ok: true, noop: true, message: `Already active on v${version}` });
  }

  // Gate verdict SERVER-SIDE (client_gate_verdict solo informativo).
  let serverVerdict: string = 'incomplete';
  if (MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    try {
      const gateResult = await computeGateVerdict(meerkat as MeerkatId, version);
      serverVerdict = gateResult.verdict;
      if (client_gate_verdict && client_gate_verdict !== serverVerdict) {
        console.warn('[activate] client_gate_verdict diverges from server', { meerkat, version, client: client_gate_verdict, server: serverVerdict });
      }
    } catch (e) {
      console.error('[activate] computeGateVerdict failed', { meerkat, version, error: (e as Error).message });
    }
  }

  if ((serverVerdict === 'fail' || serverVerdict === 'incomplete') && !override_reason?.trim()) {
    return NextResponse.json({
      error: `override_reason is required when gate_verdict is '${serverVerdict}'`,
      gate_verdict: serverVerdict,
    }, { status: 400 });
  }

  const finalReason = reason ?? (currentVersion != null && version < currentVersion ? 'rollback' : 'rollout');
  const historyReason = override_reason?.trim()
    ? `[OVERRIDE:${serverVerdict}] ${override_reason.trim()}${reason ? ` - ${reason}` : ''}`
    : (reason ?? finalReason);

  // 1. History record (mantiene UI actual de historial de versiones).
  const { error: histErr } = await supabase.from('meerkat_version_history').insert({
    meerkat_id:   meerkat,
    from_version: currentVersion,
    to_version:   version,
    changed_by:   auth.email,
    reason:       historyReason,
  });
  if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 });

  // 2. Upsert flag meerkat.<id>.v<n>. Esto ES ahora la fuente de verdad de rollout.
  const flagKey = `meerkat.${meerkat}.v${version}`;
  const description = `Rollout v${version} de ${meerkat}${reason ? `: ${reason}` : ''}`;

  const { data: beforeFlag } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .maybeSingle();

  const { data: afterFlag, error: flagErr } = await supabase
    .from('feature_flags')
    .upsert({
      flag_key:    flagKey,
      description,
      rollout_pct: initialPct,
      allowlist,
      denylist:    [],
      killed:      false,
      default_on:  false,
      updated_by:  auth.email,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'flag_key' })
    .select('*')
    .single();

  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 });

  await writeFlagAudit({
    flag_key: flagKey,
    actor:    auth.email,
    action:   beforeFlag ? 'updated' : 'created',
    before:   beforeFlag,
    after:    afterFlag,
  });

  // Invalidar caches locales de esta instancia. Otras instancias esperan sus TTL.
  clearMeerkatVersionCache();
  invalidateFlagCache();

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
    to_version:   version,
    reason:       finalReason,
    gate_verdict: serverVerdict,
    flag_key:     flagKey,
    rollout_pct:  initialPct,
    message:      `${meerkat} v${version} activated as flag ${flagKey} at ${initialPct}%. Resync in progress.`,
  });
}
