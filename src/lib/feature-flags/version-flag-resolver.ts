import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { getActiveVersion } from '@/lib/vapi/resolve-meerkat';
import { isFeatureEnabled } from './evaluator';

type AgentSlice = {
  portal_email: string | null;
  features: {
    pinned_meerkat_version?: number | null;
    [k: string]: unknown;
  };
};

export async function resolveMeerkatVersionForAgent(
  meerkatId: string,
  agent: AgentSlice,
): Promise<number> {
  const versions = MEERKAT_CONFIGS[meerkatId];
  if (!versions) return 1;

  // 1. Pin per-agent gana sobre todo
  const pinned = agent.features?.pinned_meerkat_version;
  if (typeof pinned === 'number' && versions[pinned]) {
    return pinned;
  }

  // 2. Flags meerkat.<id>.v<n> de la version mas alta a la mas baja
  const versionNumbers = Object.keys(versions).map(Number).sort((a, b) => b - a);
  for (const v of versionNumbers) {
    const flagKey = `meerkat.${meerkatId}.v${v}`;
    const on = await isFeatureEnabled(flagKey, agent.portal_email);
    if (on) return v;
  }

  // 3. Legacy fallback: active version de meerkat_active_versions
  return await getActiveVersion(meerkatId);
}
