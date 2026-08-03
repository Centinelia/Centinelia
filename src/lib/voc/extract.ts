/**
 * Voice of Customer extraction — extrae lenguaje real, objeciones y candidatos
 * de headline desde las conversaciones reales de la org (llamadas, correos,
 * tickets). Los meerkats pueden llamar esto vía la tool `extraer_voz_del_cliente`.
 *
 * Consumidores: executor.ts (chat/email), voice tool route, admin panel.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export type VoCSource = 'calls' | 'emails' | 'tickets' | 'all';

export interface VoCResult {
  ok:                boolean;
  error?:            string;
  sample_count?:     number;
  phrases?:          string[];
  objections?:       string[];
  retention_reasons?: string[];
  churn_reasons?:    string[];
  headline_candidates?: string[];
  summary?:          string;
  saved_id?:         string;
}

interface ExtractArgs {
  portalEmail: string;
  source:      VoCSource;
  days:        number;
  minSamples:  number;
  supabase:    SupabaseClient;
  requestedBy?: string | null;
}

const DEFAULT_DAYS      = 30;
const DEFAULT_MIN       = 20;
const MAX_SAMPLES       = 200;
const SAMPLE_CHARS_MAX  = 800;

async function loadSamples(
  args: { supabase: SupabaseClient; portalEmail: string; source: VoCSource; sinceIso: string }
): Promise<{ text: string; kind: string }[]> {
  const { supabase, portalEmail, source, sinceIso } = args;

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', portalEmail);
  const agentIds = (agents ?? []).map(a => a.id as string);
  if (!agentIds.length) return [];

  const samples: { text: string; kind: string }[] = [];

  if (source === 'calls' || source === 'all') {
    const { data } = await supabase
      .from('voice_calls')
      .select('transcript')
      .in('agent_id', agentIds)
      .gte('created_at', sinceIso)
      .not('transcript', 'is', null)
      .gte('duration_seconds', 20)
      .limit(MAX_SAMPLES);
    for (const row of data ?? []) {
      const t = (row.transcript as string | null)?.trim();
      if (t) samples.push({ text: t.slice(0, SAMPLE_CHARS_MAX), kind: 'llamada' });
    }
  }

  if (source === 'emails' || source === 'all') {
    const { data } = await supabase
      .from('ops_inbox')
      .select('email_body, email_from')
      .in('agent_id', agentIds)
      .gte('created_at', sinceIso)
      .not('email_body', 'is', null)
      .neq('category', 'spam')
      .limit(MAX_SAMPLES);
    for (const row of data ?? []) {
      const t = (row.email_body as string | null)?.trim();
      if (t) samples.push({ text: t.slice(0, SAMPLE_CHARS_MAX), kind: 'correo' });
    }
  }

  if (source === 'tickets' || source === 'all') {
    const { data } = await supabase
      .from('helpdesk_tickets')
      .select('descripcion, titulo')
      .in('agent_id', agentIds)
      .gte('created_at', sinceIso)
      .limit(MAX_SAMPLES);
    for (const row of data ?? []) {
      const desc = (row.descripcion as string | null)?.trim();
      const titulo = (row.titulo as string | null)?.trim();
      const text = [titulo, desc].filter(Boolean).join(' — ');
      if (text) samples.push({ text: text.slice(0, SAMPLE_CHARS_MAX), kind: 'ticket' });
    }
  }

  return samples;
}

function buildPrompt(samples: { text: string; kind: string }[]): string {
  const numbered = samples.map((s, i) => `[${i + 1}] (${s.kind}) ${s.text}`).join('\n\n');
  return `Analiza estas ${samples.length} muestras reales de conversaciones con clientes de una organización.

Extrae, en español mexicano, usando SIEMPRE el lenguaje literal del cliente cuando cite frases:

1. "phrases": 8 a 15 frases exactas que los clientes usan para describir su problema, necesidad o experiencia. No parafrasees, cita.
2. "objections": las 3 a 5 objeciones o dudas más recurrentes antes de comprar o aceptar el servicio.
3. "retention_reasons": las 3 razones más comunes por las que los clientes se quedan, valoran o recomiendan.
4. "churn_reasons": las 3 razones más comunes por las que se van, se quejan o no cierran.
5. "headline_candidates": 5 titulares o CTAs para landing/copy que usen las palabras exactas de los clientes.
6. "summary": 2 a 3 oraciones con el patrón dominante que ves.

Reglas:
- Si una muestra es genérica o vacía, ignórala. Prioriza cantidad + repetición.
- Nunca inventes frases que no aparezcan en las muestras.
- Si no hay suficiente evidencia para un campo, devuélvelo vacío ([] o "").

MUESTRAS:

${numbered}

Responde SOLO con JSON válido, sin markdown, con las 6 claves.`;
}

export async function extractVoiceOfCustomer(args: ExtractArgs): Promise<VoCResult> {
  const {
    portalEmail,
    source     = 'all',
    days       = DEFAULT_DAYS,
    minSamples = DEFAULT_MIN,
    supabase,
    requestedBy = null,
  } = args;

  if (!portalEmail) return { ok: false, error: 'portalEmail requerido.' };

  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const samples  = await loadSamples({ supabase, portalEmail, source, sinceIso });

  if (samples.length < minSamples) {
    return {
      ok: false,
      error: `Muestras insuficientes: encontré ${samples.length}, necesito al menos ${minSamples} en los últimos ${days} días para producir un análisis confiable. Prueba con una ventana más amplia o cambia la fuente.`,
      sample_count: samples.length,
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: buildPrompt(samples) }],
  });

  const block = resp.content.find(b => b.type === 'text');
  const raw   = block?.type === 'text' ? block.text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: 'El modelo no devolvió JSON válido.' };

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(match[0]); }
  catch { return { ok: false, error: 'JSON inválido en la respuesta del modelo.' }; }

  const phrases           = Array.isArray(parsed.phrases)             ? (parsed.phrases as string[]).filter(Boolean).slice(0, 20) : [];
  const objections        = Array.isArray(parsed.objections)          ? (parsed.objections as string[]).filter(Boolean).slice(0, 8) : [];
  const retentionReasons  = Array.isArray(parsed.retention_reasons)   ? (parsed.retention_reasons as string[]).filter(Boolean).slice(0, 5) : [];
  const churnReasons      = Array.isArray(parsed.churn_reasons)       ? (parsed.churn_reasons as string[]).filter(Boolean).slice(0, 5) : [];
  const headlineCandidates = Array.isArray(parsed.headline_candidates) ? (parsed.headline_candidates as string[]).filter(Boolean).slice(0, 8) : [];
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';

  const { data: saved } = await supabase
    .from('voc_insights')
    .insert({
      portal_email: portalEmail,
      source,
      window_days:  days,
      sample_count: samples.length,
      phrases,
      objections,
      retention_reasons:  retentionReasons,
      churn_reasons:      churnReasons,
      headline_candidates: headlineCandidates,
      summary:      summary || 'Sin resumen.',
      requested_by: requestedBy,
    })
    .select('id')
    .single();

  return {
    ok: true,
    sample_count:        samples.length,
    phrases,
    objections,
    retention_reasons:   retentionReasons,
    churn_reasons:       churnReasons,
    headline_candidates: headlineCandidates,
    summary,
    saved_id: saved?.id as string | undefined,
  };
}

export function formatVoCForAgent(result: VoCResult): string {
  if (!result.ok) return result.error ?? 'No se pudo extraer.';
  const parts: string[] = [];
  parts.push(`Muestras analizadas: ${result.sample_count}.`);
  if (result.summary) parts.push(`Patrón: ${result.summary}`);
  if (result.phrases?.length) {
    parts.push('Frases exactas del cliente:');
    parts.push(result.phrases.map((p, i) => `${i + 1}. "${p}"`).join('\n'));
  }
  if (result.objections?.length) {
    parts.push('Objeciones frecuentes:');
    parts.push(result.objections.map((o, i) => `${i + 1}. ${o}`).join('\n'));
  }
  if (result.retention_reasons?.length) {
    parts.push('Razones por las que se quedan:');
    parts.push(result.retention_reasons.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  }
  if (result.churn_reasons?.length) {
    parts.push('Razones por las que se van:');
    parts.push(result.churn_reasons.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  }
  if (result.headline_candidates?.length) {
    parts.push('Candidatos de headline:');
    parts.push(result.headline_candidates.map((h, i) => `${i + 1}. ${h}`).join('\n'));
  }
  return parts.join('\n\n');
}
