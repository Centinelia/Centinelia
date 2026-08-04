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

export interface StructuredContent {
  title:    string;
  sections: Array<{ heading: string; body: string; bullets?: string[] }>;
  closing:  string | null;
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

  cotizacion: `Eres el redactor comercial. Genera una cotización estructurada.
Reglas:
- Título tipo "Cotización para [cliente] - [servicio]".
- Secciones: Servicio incluido, Precios (bullets con precios), Condiciones de pago, Vigencia.
- Precios claros en MXN, con IVA cuando aplique.
- Sin em-dashes, sin emojis, sin "IA" en copy.
- Devuelve SOLO JSON: {title, sections:[{heading, body, bullets?}], closing}.`,

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

  return {
    title:    typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallbackTitle,
    sections: Array.isArray(parsed.sections) ? parsed.sections.filter(s => s && typeof s.heading === 'string' && typeof s.body === 'string') : [],
    closing:  typeof parsed.closing === 'string' ? parsed.closing : null,
  };
}
