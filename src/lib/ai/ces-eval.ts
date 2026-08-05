import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

// Términos de dominio que NO deberían aparecer en un aprendizaje global de conversación.
// Si la mejora los menciona, es porque el modelo escapó del prompt y contaminó con contexto de negocio.
// Lista deliberadamente conservadora: cualquier match => rechazo.
const BUSINESS_DOMAIN_TOKENS = [
  // Trámites/gobierno
  'anuencia', 'licencia', 'permiso', 'tramite', 'trámite', 'expediente', 'folio',
  // Industrias comunes
  'alcohol', 'bebida', 'licor', 'cerveza', 'vino',
  'dental', 'clinic', 'clínic', 'medic', 'consulta médic', 'paciente',
  'ferreter', 'restaurant', 'menú', 'menu', 'plato', 'reservación',
  'inmobiliar', 'propiedad', 'renta', 'departamento', 'casa',
  'contabil', 'fiscal', 'factura', 'impuesto', 'contribuyente',
  'construc', 'obra', 'presupuesto', 'cotización', 'cotizacion',
  // Comercio
  'producto', 'catálogo', 'catalogo', 'inventario', 'sku', 'pedido',
  'entrega', 'envío', 'envio', 'paquetería', 'paqueteria',
  // Dinero/transacciones específicas
  'mxn', 'usd', 'peso', 'dólar', 'dolar', 'tarjeta', 'transferencia', 'oxxo',
  // Legal
  'contrato', 'cláusula', 'clausula', 'demanda', 'notario',
];

// Detecta si una mejora conversacional está contaminada con contexto de negocio.
// Reglas: si contiene algún token de dominio, o menciona montos con símbolos ($, %, cantidad numérica),
// o nombres propios (2+ mayúsculas seguidas fuera del inicio), es contaminada.
export function looksLikeBusinessSpecific(mejora: string): boolean {
  const low = mejora.toLowerCase();
  for (const t of BUSINESS_DOMAIN_TOKENS) {
    if (low.includes(t)) return true;
  }
  // Monto o porcentaje explícito
  if (/\$\s?\d/.test(mejora)) return true;
  if (/\d+\s?(pesos|mxn|usd|dólares|dolares|%)/i.test(mejora)) return true;
  // Nombres propios: 2+ palabras capitalizadas seguidas en medio de la oración
  // (excluye la primera palabra de la oración)
  const midSentenceCaps = mejora.slice(1).match(/(?:^|\s)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
  if (midSentenceCaps) return true;
  return false;
}

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
"Cuando [señal CONVERSACIONAL del cliente], [acción CONVERSACIONAL en primera persona]"

REGLA CRÍTICA: la mejora se guarda en un catálogo GLOBAL que se inyecta a TODOS los empleados de la plataforma, sin importar el negocio. Debe ser un patrón conversacional puro que aplique a cualquier industria.

PROHIBIDO en la mejora:
- Referencias al negocio, producto, servicio, industria o transacción específica.
- Nombres propios (clientes, empresas, ciudades, personas).
- Montos, fechas, folios, políticas o procesos específicos.
- Términos de dominio (anuencias, alcohol, dental, ferretería, contabilidad, etc.).
- Cualquier cosa que sea aprendizaje del NEGOCIO del cliente, no de conversación humana.

Si la mejora que se te ocurre solo tiene sentido para este negocio en particular, escribe null. NO fuerces una mejora contaminada.

Ejemplos VÁLIDOS (conversacional puro):
- "Cuando el cliente responde con monosílabo, invito a expandir con una pregunta abierta breve."
- "Cuando el cliente suspira o baja el volumen, valido brevemente antes de continuar."
- "Cuando repito una idea, la reformulo con otra estructura en vez de con las mismas palabras."

Ejemplos INVÁLIDOS (contaminados con negocio, NO generar):
- "Cuando el cliente pregunta por anuencias de alcohol, explico el proceso paso a paso."
- "Cuando el cliente menciona su clínica dental, ofrezco el plan Empresarial."
- "Cuando pregunte por el pago de la anuencia, confirmo el monto y método."

Clasifícala:
- "cce": violación a un estándar conversacional concreto (dos preguntas abiertas seguidas, frase prohibida, agradeció cada dato, repitió palabra, etc.)
- "hcp": faltó un patrón humano natural (no hizo eco, omitió el "porque", no suavizó mala noticia, no usó lenguaje colaborativo, etc.)
- "mdp": microdecisión conversacional situacional — cómo responder a una señal genérica del cliente (suspiró, monosílabos, se rió, vaciló, aceleró, etc.)

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

  // Guardrail: rechazar mejoras contaminadas con dominio del negocio.
  // El catálogo es GLOBAL, no puede tener referencias específicas.
  if (looksLikeBusinessSpecific(mejora)) {
    console.log('[ces-eval] mejora rechazada por contaminación de dominio:', mejora.slice(0, 120));
    return;
  }

  // Dedup contra approved + rejected + pending: si ya vimos este learning
  // (aprobado, rechazado o pendiente), no lo re-insertamos. Sin esto, los
  // patrones rechazados resurgen cada semana y el reviewer paga el mismo
  // costo mental por siempre.
  const normalized = mejora.toLowerCase().slice(0, 200);
  const { data: existing } = await supabase
    .from('conversational_learnings')
    .select('id, body, status')
    .in('status', ['active', 'rejected', 'pending'])
    .eq('target_document', targetDoc);

  const isDupe = (existing ?? []).some(row => {
    const other = (row.body as string).toLowerCase().slice(0, 200);
    return other === normalized;
  });
  if (isDupe) return;

  await supabase.from('conversational_learnings').insert({
    body:            mejora,
    dimension:       worstDim,
    status:          'pending',
    target_document: targetDoc,
  });
}
