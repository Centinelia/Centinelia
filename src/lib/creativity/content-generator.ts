import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6' as const;

export interface ContentContext {
  agentName:    string;
  businessName: string;
  clientName:   string | null;
  clientNeed:   string | null;
  servicesKb:   string | null;
  extraContext: string | null;
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
- Sin em-dashes, sin emojis, sin "IA" en copy.
- Devuelve SOLO JSON válido.`,

  one_pager: `Eres el redactor comercial. Genera un one-pager informativo sobre un servicio.
Reglas:
- Título del servicio.
- 2-4 secciones cortas: Qué es, Cómo funciona, Beneficios, Cómo empezar.
- Body directo, ≤3 oraciones por sección.
- Sin em-dashes, sin emojis, sin "IA".
- Devuelve SOLO JSON: {title, sections:[{heading, body, bullets?}], closing}.`,

  correo: `Eres el redactor comercial. Genera un correo estructurado para el cliente.
Reglas:
- Título = asunto del correo (claro y accionable, <60 caracteres).
- Secciones = párrafos del cuerpo del correo (heading opcional o vacío).
- Cierre = despedida + firma.
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
  return parts.join('\n');
}

export async function generateStructuredContent(
  kind: 'propuesta' | 'cotizacion' | 'one_pager' | 'correo',
  ctx: ContentContext,
): Promise<StructuredContent> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 2000,
    system:     SYSTEM_PROMPTS[kind],
    messages:   [{ role: 'user', content: buildUserPrompt(ctx) }],
  });

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
