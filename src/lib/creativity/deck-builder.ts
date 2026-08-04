import Anthropic from '@anthropic-ai/sdk';
import type { createAdminClient } from '@/lib/supabase/admin';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { generateSlides, type Slide } from '@/lib/documents/slides';

type SupabaseClient = ReturnType<typeof createAdminClient>;
const MODEL = 'claude-sonnet-4-6' as const;

export interface DeckBuildResult {
  ok:          true;
  url:         string;
  file_id:     string;
  filename:    string;
  mime_type:   'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  document_id: string;
}
export interface DeckBuildError { ok: false; error: string }

interface DeckCtx {
  agentId:        string;
  agentName:      string | null;
  businessName:   string;
  portalEmail:    string;
  clientName:     string | null;
  clientNeed:     string | null;
  servicesKb:     string | null;
  extraContext:   string | null;
  contactWebsite?: string | null;
  contactEmail?:   string | null;
  contactPhone?:   string | null;
}

interface SlidePlan { title: string; bullets: string[] }

const SYSTEM_PROMPT = `Eres el redactor de pitch decks comerciales. Genera un plan de 8 a 10 slides para una presentación a cliente.

Reglas:
- Estructura estándar: Portada, El cliente (contexto), El problema, La propuesta, Alcance, Tiempos, Inversión, Siguientes pasos, Contacto.
- Cada slide tiene título corto (máx 6 palabras) y 3 a 5 bullets (máx 15 palabras cada uno).
- Portada solo tiene 1 bullet: nombre del cliente + fecha.
- El slide de Contacto DEBE usar los datos de contacto reales del negocio (website, email, teléfono) que se te dan al final del prompt. NUNCA inventes emails ni dominios.
- Español con acentos correctos.
- Sin em-dashes, sin emojis, sin "IA".
- Devuelve SOLO JSON: {"title": "string", "slides": [{"title": "string", "bullets": ["string"]}]}.`;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function bulletsToContent(bullets: string[]): string {
  return bullets.map(b => `- ${b}`).join('\n');
}

export async function buildDeck(ctx: DeckCtx, supabase: SupabaseClient): Promise<DeckBuildResult | DeckBuildError> {
  // Fetch agent logo + org brand para que el deck salga con el branding real.
  const { data: agentRow } = await (supabase as any)
    .from('voice_agents')
    .select('business_name, logo_url, email_logo_url, phone_number')
    .eq('id', ctx.agentId)
    .maybeSingle();
  const { data: orgRow } = await (supabase as any)
    .from('organizations')
    .select('logo_url, email_brand_color, brand_color_secondary, brand_website, brand_address, email_footer_text')
    .eq('portal_email', ctx.portalEmail)
    .maybeSingle();

  const brand = brandKitFromAgent(
    (agentRow as Record<string, unknown>) ?? { business_name: ctx.businessName, agent_name: ctx.agentName },
    orgRow as Record<string, unknown> | null,
  );

  const contactBlock = (ctx.contactWebsite || ctx.contactEmail || ctx.contactPhone)
    ? [
        '\nDATOS DE CONTACTO REALES DEL NEGOCIO (USA EXACTAMENTE ESTOS en el slide de Contacto, NO INVENTES):',
        ctx.contactWebsite ? `- Sitio: ${ctx.contactWebsite}` : null,
        ctx.contactEmail   ? `- Correo: ${ctx.contactEmail}` : null,
        ctx.contactPhone   ? `- Teléfono: ${ctx.contactPhone}` : null,
      ].filter(Boolean).join('\n')
    : '\nDATOS DE CONTACTO: NO tienes datos configurados. Omite datos específicos en el slide de Contacto o usa [pendiente].';

  const userPrompt = `NEGOCIO: ${ctx.businessName}
REDACTA COMO: ${ctx.agentName ?? 'Noah'}
CLIENTE: ${ctx.clientName ?? 'sin especificar'}
NECESIDAD: ${ctx.clientNeed ?? 'sin especificar'}
${ctx.servicesKb ? `\nSERVICIOS DEL NEGOCIO:\n${ctx.servicesKb}\n` : ''}${ctx.extraContext ? `\nCONTEXTO ADICIONAL:\n${ctx.extraContext}\n` : ''}${contactBlock}

Genera el plan de slides.`;

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 2500,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  let parsed: { title?: string; slides?: SlidePlan[] } = {};
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return { ok: false, error: 'El modelo no devolvió un plan de slides válido.' };
  }

  const title = typeof parsed.title === 'string' && parsed.title.trim()
    ? parsed.title.trim()
    : `Propuesta ${ctx.clientName ?? ''}`.trim();

  const slides: Slide[] = Array.isArray(parsed.slides)
    ? parsed.slides
        .filter(s => s && typeof s.title === 'string' && s.title.trim() && Array.isArray(s.bullets))
        .map(s => ({
          title:   s.title.trim(),
          content: bulletsToContent(s.bullets.filter(b => typeof b === 'string' && b.trim())),
        }))
    : [];

  if (slides.length === 0) return { ok: false, error: 'El plan de slides quedó vacío.' };

  const pptxBuffer = await generateSlides({
    title,
    slides,
    businessName: brand.businessName || ctx.businessName,
    accentColor:  brand.color,
  });

  const timestamp  = Date.now();
  const filename   = `pitch-deck-${slugify(title)}-${timestamp}.pptx`;
  const storagePath = `${ctx.agentId}/creativity/${filename}`;
  const mimeType   = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' as const;

  const { error: upErr } = await supabase.storage
    .from('agent-documents')
    .upload(storagePath, pptxBuffer, { contentType: mimeType, upsert: false });
  if (upErr) return { ok: false, error: `Upload fallo: ${upErr.message}` };

  const { data: signed } = await supabase.storage
    .from('agent-documents')
    .createSignedUrl(storagePath, 3600);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: doc, error: insErr } = await supabase
    .from('ops_documents')
    .insert({
      agent_id:      ctx.agentId,
      title,
      filename,
      storage_path:  storagePath,
      template_type: 'powerpoint',
      expires_at:    expiresAt,
    })
    .select('id')
    .single();

  if (insErr || !doc) {
    return { ok: false, error: `No se pudo registrar el documento: ${insErr?.message ?? 'unknown'}` };
  }

  return {
    ok:          true,
    url:         signed?.signedUrl ?? '',
    file_id:     storagePath,
    filename,
    mime_type:   mimeType,
    document_id: doc.id,
  };
}
