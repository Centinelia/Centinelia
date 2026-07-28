import Anthropic from '@anthropic-ai/sdk';
import { getDocumentSkill, isCriticalDocument } from './document-skills';
import type { Slide } from './slides';

const anthropic = new Anthropic();

// ── Text content (PDF, Word) ──────────────────────────────────────────────────

export async function enhanceTextContent(opts: {
  format:          string;
  templateType?:   string;
  content:         string;
  businessName:    string;
  businessContext: string;
  userInstruction: string;
}): Promise<string> {
  const skill = getDocumentSkill(opts.format, opts.templateType);
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: [{
        type: 'text',
        text: `Eres un editor experto en documentos de negocios mexicanos. Recibes un borrador y lo elevas a nivel profesional sin cambiar hechos, cifras ni datos específicos. Mejora estructura, claridad, persuasión y completitud. Responde ÚNICAMENTE con el contenido mejorado en el mismo formato markdown (# ## - **). Sin explicaciones adicionales.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role:    'user',
        content: `Negocio: ${opts.businessName}
Contexto del negocio: ${opts.businessContext.slice(0, 800)}
Solicitud original del usuario: ${opts.userInstruction.slice(0, 500)}

ESTÁNDARES DE CALIDAD PARA ESTE FORMATO:
${skill}

BORRADOR A MEJORAR:
${opts.content}

Devuelve el contenido mejorado:`,
      }],
    });
    const result = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return result.length > 50 ? result : opts.content;
  } catch {
    return opts.content;
  }
}

// ── Slides (PowerPoint) ───────────────────────────────────────────────────────

export async function enhanceSlidesContent(opts: {
  slides:          Slide[];
  businessName:    string;
  businessContext: string;
  userInstruction: string;
}): Promise<Slide[]> {
  if (opts.slides.length === 0) return opts.slides;

  const skill    = getDocumentSkill('powerpoint');
  const slidesTxt = opts.slides.map((s, i) =>
    `SLIDE ${i + 1}\ntitle: ${s.title}\ncontent: ${s.content}${s.notes ? `\nnotes: ${s.notes}` : ''}`
  ).join('\n\n');

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: [{
        type: 'text',
        text: `Eres un editor experto en presentaciones de negocios para empresas mexicanas. Mejora el contenido de cada diapositiva para que sea de nivel profesional. No cambies hechos, cifras ni datos. Devuelve ÚNICAMENTE las diapositivas mejoradas en el mismo formato exacto (SLIDE N / title: / content: / notes:), sin texto adicional.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role:    'user',
        content: `Negocio: ${opts.businessName}
Contexto: ${opts.businessContext.slice(0, 600)}
Solicitud original: ${opts.userInstruction.slice(0, 400)}

ESTÁNDARES:
${skill}

DIAPOSITIVAS A MEJORAR:
${slidesTxt}

Devuelve las diapositivas mejoradas en el mismo formato:`,
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return parseSlides(raw, opts.slides);
  } catch {
    return opts.slides;
  }
}

function parseSlides(text: string, fallback: Slide[]): Slide[] {
  try {
    const blocks = text.split(/\nSLIDE \d+\n/).filter(b => b.trim());
    if (blocks.length === 0) return fallback;

    const slides: Slide[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const title   = block.match(/^title:\s*(.+)/m)?.[1]?.trim()   ?? fallback[i]?.title   ?? '';
      const content = block.match(/^content:\s*([\s\S]*?)(?=^notes:|$)/m)?.[1]?.trim() ?? fallback[i]?.content ?? '';
      const notes   = block.match(/^notes:\s*(.+)/m)?.[1]?.trim()   ?? fallback[i]?.notes;
      slides.push({ title, content, ...(notes ? { notes } : {}) });
    }
    return slides.length === fallback.length ? slides : fallback;
  } catch {
    return fallback;
  }
}

// ── Peer review ───────────────────────────────────────────────────────────────

export async function peerReviewText(opts: {
  content:         string;
  format:          string;
  templateType?:   string;
  businessName:    string;
  peerName:        string;
  peerKb:          string;
  userInstruction: string;
}): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: [{
        type: 'text',
        text: `Eres ${opts.peerName}, agente IA del negocio ${opts.businessName}. Tu compañero preparó un documento y te pide revisarlo antes de entregarlo. Con base en lo que sabes del negocio, verifica que la información sea precisa, completa y profesional. Corrige inexactitudes o mejora lo que puedas. Responde ÚNICAMENTE con el contenido final del documento en el mismo formato markdown, sin explicaciones.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role:    'user',
        content: `Lo que sabes del negocio:
${opts.peerKb.slice(0, 1000)}

Solicitud original: ${opts.userInstruction.slice(0, 400)}

DOCUMENTO A REVISAR:
${opts.content}

Devuelve el documento revisado:`,
      }],
    });
    const result = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return result.length > 50 ? result : opts.content;
  } catch {
    return opts.content;
  }
}

export async function peerReviewSlides(opts: {
  slides:          Slide[];
  businessName:    string;
  peerName:        string;
  peerKb:          string;
  userInstruction: string;
}): Promise<Slide[]> {
  try {
    const slidesTxt = opts.slides.map((s, i) =>
      `SLIDE ${i + 1}\ntitle: ${s.title}\ncontent: ${s.content}${s.notes ? `\nnotes: ${s.notes}` : ''}`
    ).join('\n\n');

    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: [{
        type: 'text',
        text: `Eres ${opts.peerName}, agente IA del negocio ${opts.businessName}. Revisa estas diapositivas verificando que la información sea correcta y el nivel sea profesional. Devuelve ÚNICAMENTE las diapositivas en el mismo formato (SLIDE N / title: / content: / notes:), sin texto adicional.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role:    'user',
        content: `Lo que sabes del negocio:\n${opts.peerKb.slice(0, 800)}\n\nSOLICITUD ORIGINAL:\n${opts.userInstruction.slice(0, 400)}\n\nDIAPOSITIVAS:\n${slidesTxt}\n\nDevuelve las diapositivas revisadas:`,
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return parseSlides(raw, opts.slides);
  } catch {
    return opts.slides;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export { isCriticalDocument };
