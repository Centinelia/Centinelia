export type FlagRow = {
  flag_key: string;
  description: string;
  rollout_pct: number;
  allowlist: string[];
  denylist: string[];
  killed: boolean;
  default_on: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type FlagCounts = {
  orgs_on: number;
  orgs_off: number;
  orgs_via_hash: number;
  orgs_via_allowlist: number;
  orgs_via_denylist: number;
};

export type EvaluatorReason =
  | 'killed'
  | 'denylist'
  | 'allowlist'
  | 'hash_on'
  | 'hash_off'
  | 'default_on'
  | 'unknown_off';

export type FlagAction = 'created' | 'updated' | 'killed' | 'unkilled' | 'deleted';
