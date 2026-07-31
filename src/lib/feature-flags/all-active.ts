import { isFeatureEnabled, getAllFlagKeys } from './evaluator';

export async function evaluateFlagsForOrg(orgEmail: string): Promise<string[]> {
  const keys = await getAllFlagKeys();
  const results = await Promise.all(
    keys.map(async (k) => ((await isFeatureEnabled(k, orgEmail)) ? k : null)),
  );
  return results.filter((k): k is string => k !== null).sort();
}
