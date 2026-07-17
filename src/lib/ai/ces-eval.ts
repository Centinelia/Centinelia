import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

const DIMENSIONS = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'] as const;
type Dimension = typeof DIMENSIONS[number];

interface DimScore { score: number; obs: string }

export interface CesData {
  fluidez:          DimScore;
  comprension:      DimScore;
  naturalidad:      DimScore;
  conduccion:       DimScore;
  confianza:        DimScore;
  resolucion:       DimScore;
  mejora_principal: string | null;
  overall:          number;
}

export async function cesEvalCall(opts: {
  callId:    string;
  transcript: string;
}): Promise<void> {
  const { callId, transcript } = opts;

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Analiza esta transcripción de llamada y evalúa SOLO la calidad conversacional del empleado IA. NO evalúes si logró el objetivo de ventas.

TRANSCRIPT:
${transcript.slice(0, 5000)}

Evalúa del 1 al 5 cada dimensión con UNA observación específica con evidencia del transcript:

- fluidez: ¿Las pausas fueron naturales? ¿Hubo interrupciones o silencios extraños?
- comprension: ¿Entendió el objetivo sin pedir información redundante? ¿Recordó el contexto?
- naturalidad: ¿Varió su lenguaje? ¿Repitió las mismas frases? ¿Sonó robótico?
- conduccion: ¿Lideró la conversación cuando debía? ¿Sus preguntas tenían propósito?
- confianza: ¿Respondió con seguridad? ¿Reconoció sus límites sin sonar perdido?
- resolucion: ¿El cliente terminó con el problema resuelto o un siguiente paso claro?

1=Muy deficiente  2=Deficiente  3=Aceptable  4=Bueno  5=Excelente

Cuando identifiques una mejora (score ≤ 2), escríbela SIEMPRE en formato condicional:
"Cuando [señal específica del cliente observada en esta llamada], [acción concreta en primera persona]"
El CUANDO debe ser lo suficientemente específico para activarse solo en esa situación, no como regla general.

Clasifícala:
- "cce": la situación reveló violación a un estándar concreto (dos preguntas abiertas, frase prohibida, agradeció cada dato, repitió palabra, etc.)
- "hcp": la situación reveló que faltó un patrón humano natural (no hizo eco, omitió el "porque", no suavizó mala noticia, no usó lenguaje colaborativo, etc.)
- "mdp": es una microdecisión altamente situacional — cómo responder a una señal específica del cliente (suspiró, cambió de tema abruptamente, respondió con monosílabos, se rió, vaciló, aceleró el ritmo, etc.)

Responde ÚNICAMENTE con JSON válido:
{
  "fluidez":          { "score": <1-5>, "obs": "<evidencia concreta>" },
  "comprension":      { "score": <1-5>, "obs": "<evidencia concreta>" },
  "naturalidad":      { "score": <1-5>, "obs": "<evidencia concreta>" },
  "conduccion":       { "score": <1-5>, "obs": "<evidencia concreta>" },
  "confianza":        { "score": <1-5>, "obs": "<evidencia concreta>" },
  "resolucion":       { "score": <1-5>, "obs": "<evidencia concreta>" },
  "mejora_principal": "<SI algún score ≤ 2: formato CONDICIONAL 'Cuando [señal del cliente], [acción en primera persona]'. Si todos ≥ 3, escribe null>",
  "target_document":  "<'cce', 'hcp' o 'mdp' — solo si mejora_principal no es null>"
}`,
    }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return;

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(match[0]); } catch { return; }

  for (const dim of DIMENSIONS) {
    const d = parsed[dim] as Record<string, unknown> | undefined;
    if (!d || typeof d.score !== 'number') return;
    d.score = Math.min(5, Math.max(1, Math.round(d.score)));
    d.obs   = typeof d.obs === 'string' ? d.obs.slice(0, 200) : '';
  }

  const scores  = DIMENSIONS.map(d => (parsed[d] as DimScore).score);
  const overall = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const mejora  = typeof parsed.mejora_principal === 'string' && parsed.mejora_principal.trim() !== 'null'
    ? parsed.mejora_principal.trim().slice(0, 500)
    : null;

  const cesData: CesData = {
    fluidez:          parsed.fluidez     as DimScore,
    comprension:      parsed.comprension as DimScore,
    naturalidad:      parsed.naturalidad as DimScore,
    conduccion:       parsed.conduccion  as DimScore,
    confianza:        parsed.confianza   as DimScore,
    resolucion:       parsed.resolucion  as DimScore,
    mejora_principal: mejora,
    overall,
  };

  const supabase = createAdminClient();

  await supabase.from('voice_calls').update({ ces_data: cesData }).eq('id', callId);

  if (!mejora) return;

  const worstDim = DIMENSIONS.reduce((a, b) =>
    (parsed[a] as DimScore).score <= (parsed[b] as DimScore).score ? a : b,
  );

  const targetDoc = typeof parsed.target_document === 'string' &&
    ['cce', 'hcp', 'mdp'].includes(parsed.target_document)
    ? parsed.target_document as 'cce' | 'hcp' | 'mdp'
    : 'hcp';

  const { count } = await supabase
    .from('conversational_learnings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if ((count ?? 0) >= 100) return;

  await supabase.from('conversational_learnings').insert({
    body:            mejora,
    dimension:       worstDim,
    status:          'pending',
    target_document: targetDoc,
  });
}
