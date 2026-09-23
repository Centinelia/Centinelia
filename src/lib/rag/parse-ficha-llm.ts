// Parser genérico basado en LLM (Claude Sonnet 4.6) para extraer metadatos
// estructurados de cualquier ficha informativa: trámites municipales, catálogos
// de producto, procedimientos internos, etc.
//
// Ventaja sobre parsers regex específicos: cero configuración por vertical.
// Cliente sube el PDF y el LLM extrae los campos con tolerancia a variaciones
// de formato. Compatible con el mismo tipo `ParsedFicha` del parser Santiago
// para que el resto del pipeline (chunker, catalog, search) no sepa de qué
// origen viene.
//
// Costo aproximado por ficha (~5k tokens input, ~1k output, Sonnet 4.6):
//   Sin cache:  ~$0.02
//   Con cache:  ~$0.008 (system prompt cacheado; primer call paga cache_write)

import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';
import type { ParsedFicha, ParsedSection, FichaSectionType } from './parse-ficha-santiago';

const MODEL = 'claude-sonnet-4-6';

const VALID_SECTION_TYPES: readonly FichaSectionType[] = [
  'header', 'descripcion', 'ordenamientos', 'requisitos', 'ubicacion',
  'pasos', 'plazos', 'costo', 'inspeccion', 'contacto', 'otros',
];

const SYSTEM_PROMPT = `Eres un extractor de datos estructurados. Recibes el texto crudo de una ficha informativa (por ejemplo: un PDF de trámite municipal, catálogo de producto, procedimiento interno de una empresa, ficha técnica de un servicio) y devuelves un JSON estricto con los campos extraídos.

Reglas obligatorias:
1. NUNCA inventes datos. Si un campo no está en el texto, retorna null.
2. Correos electrónicos:
   - Corrige typos evidentes de dominios (ej. "santigo.gob.mx" a "santiago.gob.mx", "gmial.com" a "gmail.com").
   - Si aparecen varios correos, prefiere el que tenga dominio institucional del emisor del documento (ej. "@santiago.gob.mx" en un documento del municipio de Santiago).
   - Guarda el correo en minúsculas.
3. Teléfonos: guarda solo dígitos, sin espacios ni guiones ni paréntesis (ej. "8121335851" no "81-2133-5851").
4. Título: usa el nombre del trámite, producto, servicio o procedimiento tal como aparece en el documento. Si hay sigla común (como ISAI, RFC), inclúyela entre paréntesis después del nombre.
5. Código: extrae el identificador único del documento si existe (ej. "TS-SFT-RIN-02", "SKU-12345", "PROC-001"). Si no hay código explícito, genera uno breve en snake_case a partir del título (ej. "pago_predial" para un trámite de pago del predial).
6. Nombres de personas: guarda el nombre completo tal como aparece, sin agregar honoríficos que no estén en el texto (nada de "Lic." si el texto no lo dice).
7. Puesto: si aparece duplicado ("Directora de Ingresos Directora de Ingresos"), retorna solo la versión canónica ("Directora de Ingresos").
8. Ligas: retorna la URL completa incluyendo protocolo. Solo una liga principal; si hay varias, elige la más relevante para acceder al trámite o al producto.
9. Secciones: divide el contenido semánticamente en bloques. Cada bloque debe tener uno de estos tipos exactos: "descripcion", "ordenamientos", "requisitos", "ubicacion", "pasos", "plazos", "costo", "inspeccion", "contacto", "otros". El content debe ser el texto de esa sección (varios párrafos si aplica), preservando información útil pero sin ruido de layout.

Devuelve EXCLUSIVAMENTE un JSON válido con este schema (sin markdown, sin explicación, sin texto adicional antes o después):

{
  "codigo": string,
  "titulo": string,
  "dependencia": string | null,
  "unidadAdministrativa": string | null,
  "contactoNombre": string | null,
  "contactoPuesto": string | null,
  "contactoCorreo": string | null,
  "contactoTelefono": string | null,
  "contactoExtension": string | null,
  "ligaEnLinea": string | null,
  "direccion": string | null,
  "horario": string | null,
  "costoDescripcion": string | null,
  "plazoRespuesta": string | null,
  "sections": [
    { "type": "descripcion"|"ordenamientos"|"requisitos"|"ubicacion"|"pasos"|"plazos"|"costo"|"inspeccion"|"contacto"|"otros", "content": string }
  ]
}`;

export interface ParseLLMOpts {
  source?:      string;
  portalEmail?: string;
}

export async function parseFichaWithLLM(rawText: string, opts: ParseLLMOpts = {}): Promise<ParsedFicha> {
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('parseFichaWithLLM: texto vacío');
  }

  const t0 = Date.now();
  const anth = new Anthropic();

  let resp: Anthropic.Message;
  try {
    resp = await anth.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Texto del documento a extraer:\n\n${rawText}\n\nDevuelve SOLO el JSON con los campos extraídos.`,
      }],
    });
    void logLlmCall({
      source:      opts.source ?? 'fichas-parse-llm',
      model:       MODEL,
      usage:       resp.usage,
      portalEmail: opts.portalEmail,
      latencyMs:   Date.now() - t0,
    });
  } catch (err) {
    void logLlmCall({
      source:      opts.source ?? 'fichas-parse-llm',
      model:       MODEL,
      usage:       { input_tokens: 0, output_tokens: 0 },
      portalEmail: opts.portalEmail,
      latencyMs:   Date.now() - t0,
      error:       err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // Strip markdown fences por si Claude las mete pese a la instrucción.
  const jsonText = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `parseFichaWithLLM: JSON inválido del modelo. ${err instanceof Error ? err.message : String(err)}. Respuesta cruda (primeros 200 chars): ${text.slice(0, 200)}`
    );
  }

  const p = parsed as Record<string, unknown>;

  // Validar y normalizar secciones
  const sectionsInput = Array.isArray(p.sections) ? (p.sections as unknown[]) : [];
  const sections: ParsedSection[] = [];
  for (const raw of sectionsInput) {
    const s = raw as Record<string, unknown>;
    const type    = s.type as string;
    const content = s.content as string;
    if (typeof type !== 'string' || typeof content !== 'string') continue;
    if (!content.trim()) continue;
    const normalizedType = (VALID_SECTION_TYPES as readonly string[]).includes(type)
      ? (type as FichaSectionType)
      : ('otros' as FichaSectionType);
    sections.push({ type: normalizedType, content: content.trim() });
  }

  // Los null/undefined del LLM se preservan como null; los strings vacíos también.
  const asStringOrNull = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const titulo = asStringOrNull(p.titulo);
  if (!titulo) {
    throw new Error('parseFichaWithLLM: título no extraído (campo obligatorio)');
  }
  const codigo = asStringOrNull(p.codigo) ?? slugify(titulo);

  return {
    codigo,
    titulo,
    dependencia:          asStringOrNull(p.dependencia),
    unidadAdministrativa: asStringOrNull(p.unidadAdministrativa),
    contactoNombre:       asStringOrNull(p.contactoNombre),
    contactoPuesto:       asStringOrNull(p.contactoPuesto),
    contactoCorreo:       asStringOrNull(p.contactoCorreo),
    contactoTelefono:     asStringOrNull(p.contactoTelefono),
    contactoExtension:    asStringOrNull(p.contactoExtension),
    ligaEnLinea:          asStringOrNull(p.ligaEnLinea),
    direccion:            asStringOrNull(p.direccion),
    horario:              asStringOrNull(p.horario),
    costoDescripcion:     asStringOrNull(p.costoDescripcion),
    plazoRespuesta:       asStringOrNull(p.plazoRespuesta),
    rawText,
    sections,
  };
}

// Fallback para códigos: si el LLM no encuentra uno, generamos snake_case a
// partir del título. Ej. "Pago del Impuesto Predial" → "pago_del_impuesto_predial".
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}
