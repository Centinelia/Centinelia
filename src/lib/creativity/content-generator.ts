import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

const MODEL = 'claude-sonnet-4-6' as const;

export interface ContentContext {
  agentName:    string;
  businessName: string;
  clientName:   string | null;
  clientNeed:   string | null;
  servicesKb:   string | null;
  extraContext: string | null;
  /** Datos reales de contacto del negocio (viene de organizations).
   * Si el LLM necesita mencionar email/dominio/teléfono, DEBE usar estos y NO inventar.
   * Opcionales para retrocompatibilidad — si no se pasan, el prompt le dice "no menciones datos". */
  contactWebsite?: string | null;
  contactEmail?:   string | null;
  contactPhone?:   string | null;
}

export interface QuotationItem {
  descripcion:     string;
  cantidad:        number;
  precio_unitario: number;
  unidad?:         string;
}

export interface StructuredContent {
  title:    string;
  sections: Array<{ heading: string; body: string; bullets?: string[] }>;
  closing:  string | null;
  /** Solo aplica cuando kind='cotizacion' Y hay desglose de items. Cuando existe,
   * el PDF renderea tabla real con cantidad + precio + subtotal + total calculado. */
  items?:   QuotationItem[];
  /** Solo aplica cuando items existe. IVA se calcula al 16%. Default false. */
  incluir_iva?: boolean;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  propuesta: `Eres el redactor comercial. Genera una propuesta comercial estructurada.
Reglas:
- Título específico (nombre del cliente + servicio).
- 3-5 secciones máximo: Objetivo, Alcance, Tiempos, Inversión, Siguiente paso.
- Body de cada sección en 2-4 oraciones directas.
- Bullets solo cuando aporten claridad (listas de entregables, requisitos, etc.).
- Cierre profesional y cálido, sin em-dashes.
- USA ÚNICAMENTE los datos de contacto reales que se te dieron. NUNCA inventes dominios (.com vs .mx), emails ni teléfonos.
- Español con acentos correctos.
- Sin emojis. Sin "IA" en el copy.
- Devuelve SOLO JSON válido: {title, sections:[{heading, body, bullets?}], closing}.`,

  cotizacion: `Eres el redactor comercial. Genera una cotización profesional.

REGLA DE FORMATO — dos modos según el contenido:

MODO A (con desglose de items): úsalo cuando la cotización tiene MÚLTIPLES productos/servicios con cantidad y precio unitario claramente separables. Ejemplo: "3 licencias CRM + capacitación + soporte anual" son 3 items distintos.
Devuelve JSON con campo "items":
{
  "title": "Cotización para [cliente] - [servicio]",
  "sections": [{heading:"Notas", body:"contexto extra opcional"}, {heading:"Condiciones", body:"condiciones de pago, vigencia"}],
  "closing": "Cierre profesional breve",
  "items": [
    {"descripcion": "Licencia CRM Enterprise", "cantidad": 3, "precio_unitario": 15000, "unidad": "usuario"},
    {"descripcion": "Capacitación equipo (8h)", "cantidad": 1, "precio_unitario": 5000},
    {"descripcion": "Soporte técnico anual", "cantidad": 12, "precio_unitario": 833.33, "unidad": "mes"}
  ],
  "incluir_iva": false
}
En modo A, el PDF genera tabla real con subtotales y total. NO pongas precios en las sections — ya van en los items.

MODO B (sin items estructurados): úsalo cuando la cotización es un servicio único con precio total, o cuando el usuario no dio suficiente detalle para desglosar items.
Devuelve JSON SIN campo "items":
{
  "title": "Cotización para [cliente] - [servicio]",
  "sections": [{heading:"Servicio incluido", body:"..."}, {heading:"Inversión", body:"$50,000 MXN"}, {heading:"Condiciones", body:"..."}, {heading:"Vigencia", body:"30 días"}],
  "closing": "Cierre profesional breve"
}

Prefiere MODO A siempre que puedas identificar items separables. Usa MODO B solo si no hay desglose posible.

Otras reglas (ambos modos):
- Precios en MXN.
- **Español CORRECTO con acentos**: escribe "Capacitación", "técnico", "días", "Facturación", "sesión", "términos", "duración", "número". NUNCA los strippees. Los caracteres UTF-8 se ven bien en el PDF final.
- Sin em-dashes, sin emojis, sin "IA" en copy.
- En MODO A, NO metas una sección llamada "Condiciones" — el PDF ya trae condiciones estándar hardcoded. Solo usa sections para notas/contexto extra.
- Devuelve SOLO JSON válido.`,

  one_pager: `Eres el redactor comercial. Genera un one-pager ejecutivo sobre un servicio.

REGLA CRÍTICA: SIEMPRE incluye las 4 secciones abajo, en ese orden, SIN OMITIR NINGUNA. Un one-pager con menos secciones es un fallo. Si no tienes info del negocio para "Qué incluye" o "Beneficios clave", inventa bullets creíbles y genéricos del sector (ej: "Diagnóstico inicial gratuito", "Implementación en menos de 30 días"). Nunca dejes una sección fuera.

Estructura obligatoria (LAS 4, NUNCA MENOS):
- Título: nombre corto del servicio (máx 8 palabras, sin "con [empresa]" al final — ya viene el nombre en el header del PDF).
- Section 1 heading "El problema que resuelve" — 2-3 oraciones describiendo el dolor del cliente. Sin bullets.
- Section 2 heading "Qué incluye" — 1-2 oraciones intro + 3-5 bullets concretos con lo que se entrega. Los bullets son OBLIGATORIOS.
- Section 3 heading "Beneficios clave" — 1-2 oraciones intro + 3-5 bullets con resultados tangibles. Los bullets son OBLIGATORIOS.
- Section 4 heading "Cómo empezar" — 1-2 oraciones sobre el primer paso, sin bullets.
- Closing (fuera de sections): CTA accionable con datos REALES de contacto. Menciona el NOMBRE DEL NEGOCIO (no el nombre del empleado que lo genera) porque el one-pager se envía a prospectos que no conocen al empleado individual. Ejemplo bueno: "Escríbenos a contacto@empresa.com o visita empresa.com para agendar". Ejemplo malo: "Agenda tu sesión con Noah".

Reglas duras:
- USA ÚNICAMENTE los datos de contacto que se te dieron (website/email/teléfono). NUNCA inventes dominios (.com vs .mx), emails ni teléfonos. Si no hay datos, omite el CTA.
- Body directo, ≤3 oraciones por sección.
- Sin em-dashes, sin emojis, sin "IA".
- Español con acentos correctos (día, más, sesión, información, etc.).
- Devuelve SOLO JSON con las 4 sections: {title, sections:[{heading:"El problema que resuelve", body, bullets?}, {heading:"Qué incluye", body, bullets:[...]}, {heading:"Beneficios clave", body, bullets:[...]}, {heading:"Cómo empezar", body}], closing}.`,

  correo: `Eres el redactor comercial. Genera un correo estructurado para el cliente.
Reglas:
- Título = asunto del correo (claro y accionable, <60 caracteres).
- Secciones = párrafos del cuerpo del correo (heading opcional o vacío).
- Cierre = despedida + firma. Puedes firmar con el nombre del empleado que redacta seguido del nombre del negocio.
- USA ÚNICAMENTE los datos de contacto reales que se te dieron. NUNCA inventes dominios, emails ni teléfonos.
- Español con acentos correctos.
- Tono cálido pero profesional, sin em-dashes, sin emojis, sin "IA".
- Devuelve SOLO JSON: {title, sections:[{heading, body, bullets?}], closing}.`,
};

function buildUserPrompt(ctx: ContentContext): string {
  const parts: string[] = [];
  parts.push(`NEGOCIO: ${ctx.businessName}`);
  parts.push(`REDACTA COMO: ${ctx.agentName}`);
  if (ctx.clientName)   parts.push(`CLIENTE: ${ctx.clientName}`);
  if (ctx.clientNeed)   parts.push(`NECESIDAD DEL CLIENTE: ${ctx.clientNeed}`);
  if (ctx.servicesKb)   parts.push(`\nSERVICIOS/PRODUCTOS DEL NEGOCIO:\n${ctx.servicesKb}`);
  if (ctx.extraContext) parts.push(`\nCONTEXTO ADICIONAL:\n${ctx.extraContext}`);

  // Datos reales de contacto — el LLM DEBE usar estos, no inventar variantes.
  const contactLines: string[] = [];
  if (ctx.contactWebsite) contactLines.push(`- Sitio web: ${ctx.contactWebsite}`);
  if (ctx.contactEmail)   contactLines.push(`- Correo: ${ctx.contactEmail}`);
  if (ctx.contactPhone)   contactLines.push(`- Teléfono: ${ctx.contactPhone}`);
  if (contactLines.length > 0) {
    parts.push(`\nDATOS DE CONTACTO REALES DEL NEGOCIO (usa EXACTAMENTE estos si mencionas contacto en el doc, NO inventes emails ni dominios):\n${contactLines.join('\n')}`);
  } else {
    parts.push(`\nDATOS DE CONTACTO: NO tienes datos reales de contacto configurados. NO menciones emails, dominios ni teléfonos en el documento — omite el CTA de contacto o pon un placeholder [pendiente].`);
  }

  return parts.join('\n');
}

export async function generateStructuredContent(
  kind: 'propuesta' | 'cotizacion' | 'one_pager' | 'correo',
  ctx: ContentContext,
): Promise<StructuredContent> {
  const anthropic = new Anthropic();
  const __t = Date.now();
  let response;
  try {
    response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 2000,
      system:     SYSTEM_PROMPTS[kind],
      messages:   [{ role: 'user', content: buildUserPrompt(ctx) }],
    });
    void logLlmCall({ source: 'content_generator', model: MODEL, usage: response.usage, latencyMs: Date.now() - __t, meta: { kind } });
  } catch (err) {
    void logLlmCall({ source: 'content_generator', model: MODEL, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { kind } });
    throw err;
  }

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  let parsed: Partial<StructuredContent> = {};
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch { /* fall through */ }

  const fallbackTitle = ctx.clientName ? `Documento para ${ctx.clientName}` : 'Documento';

  const items: QuotationItem[] | undefined = Array.isArray(parsed.items)
    ? parsed.items
        .filter((it): it is QuotationItem =>
          !!it && typeof it.descripcion === 'string' && it.descripcion.trim() !== ''
          && typeof it.cantidad === 'number' && it.cantidad > 0
          && typeof it.precio_unitario === 'number' && it.precio_unitario >= 0,
        )
        .map(it => ({
          descripcion:     it.descripcion.trim(),
          cantidad:        it.cantidad,
          precio_unitario: it.precio_unitario,
          unidad:          typeof it.unidad === 'string' && it.unidad.trim() ? it.unidad.trim() : undefined,
        }))
    : undefined;

  return {
    title:    typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallbackTitle,
    sections: Array.isArray(parsed.sections) ? parsed.sections.filter(s => s && typeof s.heading === 'string' && s.heading.trim() && typeof s.body === 'string' && s.body.trim()) : [],
    closing:  typeof parsed.closing === 'string' ? parsed.closing : null,
    ...(items && items.length > 0 ? { items } : {}),
    ...(typeof parsed.incluir_iva === 'boolean' ? { incluir_iva: parsed.incluir_iva } : {}),
  };
}
