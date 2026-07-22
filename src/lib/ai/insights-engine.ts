export interface InsightRec {
  title:          string;
  body:           string;
  metric_key?:    string;
  current_value?: number;
  priority:       'high' | 'medium' | 'low';
}
export interface CallRow {
  outcome:           string;
  self_eval_score?:  number | null;
  self_eval_notes?:  string | null;
  ces_data?:         Record<string, unknown> | null;
}
export async function generateLLMInsights(_opts: unknown): Promise<InsightRec[]> { return []; }
