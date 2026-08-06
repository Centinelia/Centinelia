/**
 * Brand voice guide extraction — analiza muestras de texto del negocio (correos
 * previos, copy del sitio, pitch escrito) y produce una guía de tono estructurada
 * que se inyecta en el system prompt de los meerkats.
 *
 * Consumidores: chat tool `extraer_tono_de_marca`, API onboarding, portal settings.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { createAdminClient } from '@/lib/supabase/admin';
import { logLlmCall } from '@/lib/observability/llm-log';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface BrandVoiceResult {
  ok:      boolean;
  error?:  string;
  guide?:  string;
}

interface ExtractArgs {
  portalEmail: string;
  samples:     string[];
  supabase:    SupabaseClient;
}

const MIN_SAMPLES     = 2;
const MIN_CHARS_TOTAL = 400;
const MAX_SAMPLE_CHARS = 4000;

function buildPrompt(samples: string[]): string {
  const numbered = samples.map((s, i) => `[Muestra ${i + 1}]\n${s.slice(0, MAX_SAMPLE_CHARS)}`).join('\n\n');
  return `Analiza estas muestras reales de comunicación de un negocio y produce una GUÍA DE TONO reutilizable en español mexicano.

La guía se va a inyectar en el system prompt de un empleado digital (voz + texto) para que hable como este negocio. Sé específico y accionable, no genérico.

Estructura la guía con estos bloques exactos, en español, en menos de 400 palabras totales:

- Ritmo y longitud de oraciones (ejemplo típico observado).
- Palabras o expresiones que este negocio usa recurrentemente (lista 6 a 10).
- Palabras o expresiones que NUNCA usa o evita (lista 3 a 6).
- Trato al cliente (tú/usted, formal/informal, cercano/distante).
- Cómo abre y cómo cierra los mensajes (patrón típico).
- Actitud dominante (por ejemplo: directo, cálido, técnico, empático).

Reglas:
- Basa cada punto en evidencia real de las muestras. No inventes.
- Si una categoría no se puede inferir con confianza, dila más corta o omítela — no rellenes.
- Salida final: texto plano listo para pegar. Sin markdown, sin encabezados con # ni **.

MUESTRAS:

${numbered}`;
}

export async function extractBrandVoice(args: ExtractArgs): Promise<BrandVoiceResult> {
  const { portalEmail, samples, supabase } = args;
  if (!portalEmail) return { ok: false, error: 'portalEmail requerido.' };

  const cleaned = samples.map(s => s.trim()).filter(s => s.length > 40);
  if (cleaned.length < MIN_SAMPLES) return { ok: false, error: `Necesito al menos ${MIN_SAMPLES} muestras con contenido real.` };
  const totalChars = cleaned.reduce((n, s) => n + s.length, 0);
  if (totalChars < MIN_CHARS_TOTAL) return { ok: false, error: `Muestras muy cortas. Junta al menos ${MIN_CHARS_TOTAL} caracteres entre todas.` };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const __t = Date.now();
  const __m = 'claude-sonnet-4-6';
  let resp;
  try {
    resp = await client.messages.create({
      model:      __m,
      max_tokens: 1200,
      messages: [{ role: 'user', content: buildPrompt(cleaned) }],
    });
    void logLlmCall({ source: 'brand_voice_guide', model: __m, usage: resp.usage, portalEmail, latencyMs: Date.now() - __t });
  } catch (err) {
    void logLlmCall({ source: 'brand_voice_guide', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, portalEmail, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const block = resp.content.find(b => b.type === 'text');
  const guide = block?.type === 'text' ? block.text.trim() : '';
  if (!guide) return { ok: false, error: 'El modelo no devolvió guía.' };

  const { error } = await supabase
    .from('organizations')
    .update({
      brand_voice_guide:      guide,
      brand_voice_updated_at: new Date().toISOString(),
    })
    .eq('portal_email', portalEmail);

  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };

  return { ok: true, guide };
}

/** Reads current brand voice guide for an org. Returns null if not set. */
export async function getBrandVoiceGuide(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from('organizations')
    .select('brand_voice_guide')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  const g = (data?.brand_voice_guide as string | null)?.trim();
  return g || null;
}
