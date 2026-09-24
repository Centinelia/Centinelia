// Extractor post-llamada del pack perfiles_vivos.
//
// Se dispara desde el webhook end-of-call-report de Vapi después del insert
// exitoso en voice_calls. Flow:
//
//   1. Verifica que el org tenga perfiles_vivos activo. Si no, no-op.
//   2. Busca contacto vivo por sufijo de 10 dígitos del caller_number.
//      Si no encuentra, no-op (el pack no crea contactos automáticamente
//      para no ensuciar la cartera con randoms).
//   3. Manda transcript + summary a Claude Sonnet 4.6 con prompt caching.
//   4. Registra la interacción con los datos extraídos (dispara el trigger
//      SQL que actualiza contadores + ultima_interaccion + sentimiento_ultimo).
//   5. Si la extracción incluye cambio de estado (promesa cumplida,
//      escalación, etc.), llama actualizarContactoEstado.
//
// Diseñado como fire-and-forget desde el webhook: envuelve todo en try/catch
// y loguea sin propagar excepciones. El webhook debe responder 200 aunque el
// extractor falle.

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLlmCall } from '@/lib/observability/llm-log';
import { registrarInteraccion, actualizarContactoEstado } from './lookup';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Eres un extractor de datos estructurados de conversaciones telefónicas de cobranza, ventas o atención al cliente. Recibes el transcript de una llamada real y devuelves JSON con los datos capturados.

Reglas obligatorias:
1. NUNCA inventes datos. Si algo no está en el transcript, retorna null.
2. Resumen debe ser 1-2 oraciones directas, sin adjetivos innecesarios.
3. Sentimiento: elige exactamente uno de estos valores según lo que dice y cómo lo dice el cliente en el transcript.
   - "cooperativo": muestra disposición a resolver, acepta plan, colabora
   - "evasivo": da rodeos, no compromete, cambia de tema
   - "agresivo": hostil, ofensivo, amenaza
   - "frustrado": molesto pero no agresivo, quiere solución
   - "positivo": contento, agradecido, satisfecho
   - "neutro": conversación transaccional sin carga emocional
4. Temas: array de 2-5 strings cortos que caractericen la llamada (ej. "pago_prometido", "queja_servicio", "cambio_datos", "consulta_saldo", "negociacion_plan").
5. Promesa: solo si el cliente prometió una acción concreta con monto y fecha. Si dice "voy a ver", "quizás", "cuando pueda", eso no es promesa.
6. Proxima_accion: qué debe hacer el negocio después de esta llamada (ej. "llamar en 3 días para confirmar pago", "enviar estado de cuenta por correo").
7. Escalado_a: solo si el empleado explícitamente transfirió o escaló a alguien.
8. Cambio_estado: solo si detectas transición clara de estado del contacto. Valores: "activo", "promesa_pendiente", "promesa_rota", "legal", "pagado", "inactivo".
9. Capacidad_pago_detectada: solo si el cliente dio señales claras de su capacidad. Valores: "alta", "media", "baja". Si no hay señales, retorna null o "desconocida".

Devuelve EXCLUSIVAMENTE un JSON válido con este schema (sin markdown, sin texto adicional):

{
  "resumen": string,
  "sentimiento": "cooperativo" | "evasivo" | "agresivo" | "frustrado" | "positivo" | "neutro",
  "temas": string[],
  "promesa_monto": number | null,
  "promesa_fecha": string | null,
  "proxima_accion": string | null,
  "escalado_a": string | null,
  "cambio_estado": string | null,
  "capacidad_pago_detectada": "alta" | "media" | "baja" | "desconocida" | null,
  "promesa_cumplida": boolean
}

promesa_cumplida es true solo cuando el cliente CONFIRMA en esta llamada que ya cumplió una promesa previa (ej. "ya deposité los $500 que le dije"), no cuando promete algo nuevo.`;

interface ExtractOpts {
  portalEmail:    string;
  agentId:        string;
  callDbId:       string;
  callerNumber:   string;
  transcript:     string;
  summary?:       string | null;
  durationSeg?:   number;
  tipo?:          'llamada_entrante' | 'llamada_saliente';
}

function last10Digits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  return digits.slice(-10);
}

export async function extraerYRegistrarInteraccion(opts: ExtractOpts): Promise<void> {
  const supabase = createAdminClient();

  // 1. Feature gate por org
  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', opts.portalEmail)
    .maybeSingle();
  const orgFeatures = (org?.features as Record<string, unknown> | undefined) ?? {};
  if (orgFeatures.perfiles_vivos !== true) return;

  // 2. Buscar contacto por sufijo de 10 dígitos
  const suffix = last10Digits(opts.callerNumber);
  if (!suffix) return;

  const { data: candidates } = await supabase
    .from('contactos_vivos')
    .select('id, nombre, telefono, estado_actual')
    .eq('portal_email', opts.portalEmail)
    .not('telefono', 'is', null);
  const contacto = (candidates ?? []).find((c) => last10Digits(c.telefono as string) === suffix);
  if (!contacto) {
    // Sin contacto: no creamos randoms para no ensuciar la cartera. El cliente
    // sube la cartera por adelantado. Si un desconocido llama, no hacemos nada.
    return;
  }

  // 3. Extraer con Claude Sonnet 4.6 + caching
  if (!opts.transcript || opts.transcript.trim().length < 30) return;

  const anth = new Anthropic();
  const t0 = Date.now();
  let extracted: Record<string, unknown>;

  try {
    const resp = await anth.messages.create({
      model:      MODEL,
      max_tokens: 800,
      system:     [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Contacto: ${contacto.nombre}\nSummary previo (si existe): ${opts.summary ?? '(sin summary)'}\n\nTranscript de la llamada:\n\n${opts.transcript}\n\nDevuelve SOLO el JSON extraído.`,
      }],
    });

    void logLlmCall({
      source:      'perfiles-vivos-extractor',
      model:       MODEL,
      usage:       resp.usage,
      portalEmail: opts.portalEmail,
      agentId:     opts.agentId,
      latencyMs:   Date.now() - t0,
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    extracted = JSON.parse(text);
  } catch (err) {
    void logLlmCall({
      source:      'perfiles-vivos-extractor',
      model:       MODEL,
      usage:       { input_tokens: 0, output_tokens: 0 },
      portalEmail: opts.portalEmail,
      agentId:     opts.agentId,
      latencyMs:   Date.now() - t0,
      error:       err instanceof Error ? err.message : String(err),
    });
    console.error('[perfiles-vivos-extractor] LLM extraction failed:', err);
    return;
  }

  // 4. Registrar interacción
  try {
    await registrarInteraccion({
      portalEmail:    opts.portalEmail,
      contactoId:     contacto.id as string,
      tipo:           opts.tipo ?? 'llamada_entrante',
      meerkatId:      opts.agentId,
      canal_ref_id:   opts.callDbId,
      duracion_seg:   opts.durationSeg,
      resumen:        (extracted.resumen as string) ?? undefined,
      sentimiento:    (extracted.sentimiento as string) ?? undefined,
      temas:          Array.isArray(extracted.temas) ? (extracted.temas as string[]) : undefined,
      promesa_monto:  typeof extracted.promesa_monto === 'number' ? extracted.promesa_monto : undefined,
      promesa_fecha:  (extracted.promesa_fecha as string) ?? undefined,
      proxima_accion: (extracted.proxima_accion as string) ?? undefined,
      escalado_a:     (extracted.escalado_a as string) ?? undefined,
      raw_transcript: opts.transcript,
    });
  } catch (err) {
    console.error('[perfiles-vivos-extractor] registrar_interaccion failed:', err);
  }

  // 5. Actualizar estado si el extractor lo detectó
  const cambioEstado = (extracted.cambio_estado as string) ?? null;
  const capacidad    = (extracted.capacidad_pago_detectada as string) ?? null;
  const promesaCump  = extracted.promesa_cumplida === true;

  if (cambioEstado || capacidad || promesaCump) {
    try {
      await actualizarContactoEstado({
        portalEmail:              opts.portalEmail,
        contactoId:               contacto.id as string,
        estado_actual:            cambioEstado ?? undefined,
        capacidad_pago_detectada: capacidad && capacidad !== 'desconocida' ? capacidad : undefined,
        promesa_cumplida:         promesaCump,
      });
    } catch (err) {
      console.error('[perfiles-vivos-extractor] actualizar_contacto_estado failed:', err);
    }
  }
}
