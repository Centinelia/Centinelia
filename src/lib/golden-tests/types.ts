export type MeerkatId =
  | 'nia' | 'noah' | 'nico' | 'nelia' | 'nara'
  | 'naia' | 'neo' | 'nova' | 'nox' | 'niva';

export const MEERKAT_IDS: readonly MeerkatId[] = [
  'nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova', 'nox', 'niva',
] as const;

export interface GoldenScenario {
  /** Slug estable, ej: 'nia.agendar-cita-tarde-insistente' */
  id: string;
  meerkat_id: MeerkatId;
  /** Legible en admin UI */
  title: string;
  user_persona: {
    /** "conseguir cita para vacunar perro entre 4 y 6pm" */
    goal: string;
    /** Guía de tono/dificultad al usuario simulado (concatenado a su system prompt) */
    script_hints: string;
    /** Primer turno del usuario (fijo para reducir variance) */
    initial_message: string;
  };
  /** Lista textual de criterios que el juez debe evaluar */
  success_criteria: string[];
  /** 3-15: hard cut después de esto */
  max_turns: number;
  /** Instrucciones adicionales para el juez (además de los success_criteria) */
  judge_rubric: string;
  /** ISO date. Sin esto, el escenario NO afecta gate_verdict */
  calibrated_at?: string;
  /** Score mediano observado en calibración inicial (N=5) */
  calibrated_score?: number;
}

export interface ConversationTurn {
  role: 'user' | 'meerkat';
  content: string;
}

export interface JudgeOutput {
  /** 0.00 - 1.00 */
  score: number;
  passed_criteria: string[];
  failed_criteria: string[];
  reasoning: string;
}

export type ScenarioError =
  | 'meerkat_provider_fail'
  | 'judge_parse_fail'
  | 'user_loop'
  | 'max_turns_reached'
  | 'user_provider_fail';

export interface TokensUsed {
  user: number;
  meerkat: number;
  judge: number;
}

export interface ScenarioRun {
  scenario_id: string;
  version: number;
  score: number | null;
  /** score >= 0.70; informativo, NO usado por gate */
  scenario_passed: boolean;
  transcript: ConversationTurn[];
  judge_output: JudgeOutput | null;
  duration_ms: number;
  error: ScenarioError | null;
  tokens_used: TokensUsed;
  cost_usd: number;
}

export type GateVerdict = 'pass' | 'warn' | 'fail' | 'incomplete';

export interface GateStatus {
  meerkat_id: MeerkatId;
  active: { version: number; median: number; scenarios_scored: number } | null;
  target: {
    version: number;
    median: number | null;
    scenarios_scored: number;
    run_status: 'none' | 'queued' | 'running' | 'completed' | 'failed';
    progress: number; // 0-1
  };
  delta: number | null;
  verdict: GateVerdict;
}
