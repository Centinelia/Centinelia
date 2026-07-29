/**
 * F10.1 Tournament pattern para KB Generator.
 *
 * Genera 3 variantes en paralelo con estilos diferentes:
 *  - A "directo"      — telegráfico extremo, ideal para operación rápida
 *  - B "cálido"       — cercano y humano, ideal para atención al cliente
 *  - C "estructurado" — procedimental con pasos numerados, ideal para procesos claros
 *
 * El cliente compara side-by-side y elige la que mejor le queda a su negocio.
 * Costo: 3 ops totales (mismo que 1 variante hoy) — le damos más valor sin cobrar más.
 *
 * Este endpoint no hace streaming: retorna JSON con las 3 variantes cuando terminan.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { KB_LIMITS } from '@/lib/portal/kb-limits';

export const dynamic = 'force-dynamic';

const OPS_COST = 3;

interface Params { params: Promise<{ token: string }> }

type VariantKind = 'directo' | 'calido' | 'estructurado';

const STYLE_INSTRUCTIONS: Record<VariantKind, { label: string; guidance: string }> = {
  directo: {
    label: 'Directo',
    guidance:
      'Estilo TELEGRÁFICO extremo. Frases nominales sin verbos cuando se pueda. Cero conectores. Un dato por línea. Ejemplos: "Corte: $150", "Cita: WhatsApp", "Pago: efectivo o tarjeta".',
  },
  calido: {
    label: 'Cálido',
    guidance:
      'Estilo cercano y humano, pero breve. Frases cortas con calidez natural. Sin marketing exagerado. Ejemplos: "Atendemos con gusto de 9 a 6", "Puedes pagar con efectivo o tarjeta, lo que te acomode".',
  },
  estructurado: {
    label: 'Estructurado',
    guidance:
      'Estilo procedimental. Usa numeración (1, 2, 3) para procesos y decisiones donde tenga sentido. Cada procedimiento en pasos claros. Prioriza orden sobre brevedad, sin volverse verboso.',
  },
};

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const { type, role, filter } = await req.json() as { type: 'business' | 'role'; role?: string; filter?: boolean };

  if (type !== 'business' && type !== 'role')
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
  if (type === 'role' && !role?.trim())
    return NextResponse.json({ error: 'Rol requerido' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name, first_message, transfer_rules, role_knowledge_base, role_learnings')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });

  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const ops = await consumeAiOp(agent.id, OPS_COST);
  if (!ops.ok)
    return NextResponse.json(
      { error: `Sin ops disponibles (${ops.used}/${ops.limit} usadas)` },
      { status: 402 }
    );

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 });

  const { data: org } = agent.portal_email
    ? await supabase
        .from('organizations')
        .select('business_description, business_website, website_knowledge, business_hours, knowledge_base')
        .eq('portal_email', agent.portal_email)
        .single()
    : { data: null };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const businessName   = agent.business_name ?? 'este negocio';
  const description    = org?.business_description?.trim()  || null;
  const website        = org?.business_website?.trim()      || null;
  const websiteContent = org?.website_knowledge?.trim()     || null;
  const hours          = org?.business_hours                || null;
  const existingKb     = org?.knowledge_base?.trim()        || null;
  const firstMessage   = (agent as any).first_message?.trim()        || null;
  const transferRules  = (agent as any).transfer_rules?.trim()       || null;
  const existingRole   = (agent as any).role_knowledge_base?.trim()  || null;
  const roleLearnings  = (agent as any).role_learnings?.trim()       || null;

  let hoursText: string | null = null;
  if (hours && typeof hours === 'object') {
    const days: Record<string, string> = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo' };
    const lines = Object.entries(hours as Record<string, { open: string; close: string; closed?: boolean }>)
      .map(([d, v]) => v.closed ? `${days[d] ?? d}: Cerrado` : `${days[d] ?? d}: ${v.open} – ${v.close}`)
      .filter(Boolean);
    if (lines.length) hoursText = lines.join('\n');
  }

  const buildBusinessPrompt = (style: VariantKind) => `Eres un especialista en bases de conocimiento para negocios en México. Genera una base de conocimiento COMPACTA y accionable para un agente IA telefónico.

ESTILO ELEGIDO: ${STYLE_INSTRUCTIONS[style].label.toUpperCase()}
${STYLE_INSTRUCTIONS[style].guidance}

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
${description    ? `- Descripción del negocio: ${description}` : ''}
${website        ? `- URL del sitio web: ${website}` : ''}
${hoursText      ? `- Horarios de atención:\n${hoursText}` : ''}
${firstMessage   ? `- Saludo actual del agente: "${firstMessage}"` : ''}
${transferRules  ? `- Reglas de transferencia actuales: ${transferRules}` : ''}
${websiteContent ? `\nCONTENIDO EXTRAÍDO DEL SITIO WEB (fuente principal — usa estos datos reales):
---
${websiteContent.slice(0, 6000)}
---` : ''}
${existingKb     ? `\nBase de conocimiento actual (mejora, organiza y compacta esto):\n${existingKb}` : ''}

REGLA DE ORO — LONGITUD:
- Objetivo estricto: menos de ${KB_LIMITS.business.soft.toLocaleString('es-MX')} caracteres. Ideal ${Math.round(KB_LIMITS.business.soft * 0.8).toLocaleString('es-MX')}.
- Límite máximo absoluto: ${KB_LIMITS.business.hard.toLocaleString('es-MX')} caracteres. NUNCA lo excedas.

INSTRUCCIONES DE FORMATO:
- Texto plano sin markdown, sin asteriscos, sin guiones largos
- Títulos de sección en MAYÚSCULAS
- Español mexicano natural
- Solo usa [COMPLETAR: descripción] para datos que genuinamente no puedas inferir

GENERA ESTAS SECCIONES (todas cortas, con el estilo indicado arriba):

QUÉ HACEMOS
1-2 líneas.

SERVICIOS Y PRECIOS
Un renglón por servicio.

HORARIOS Y UBICACIÓN
Días, horas, dirección o zona.

PROCESO Y PAGO
Cómo agendan / cotizan / piden. Formas de pago.

PREGUNTAS FRECUENTES
5-6 preguntas reales, respuestas de 1-2 líneas máximo.

POLÍTICAS CLAVE
Cancelaciones, garantías. Solo lo esencial.

INSTRUCCIONES PARA EL AGENTE
- Qué transferir y a quién
- Qué NUNCA compartir`;

  const buildRolePrompt = (style: VariantKind) => `Eres un especialista en procesos operativos para negocios en México. Genera instrucciones COMPACTAS para un empleado IA con un rol específico.

ESTILO ELEGIDO: ${STYLE_INSTRUCTIONS[style].label.toUpperCase()}
${STYLE_INSTRUCTIONS[style].guidance}

DATOS:
- Negocio: ${businessName}
${description    ? `- Descripción del negocio: ${description}` : ''}
- Rol del empleado: ${role}
${websiteContent ? `\nCONTENIDO DEL SITIO WEB (úsalo para entender los procesos y servicios reales del negocio):
---
${websiteContent.slice(0, 4000)}
---` : ''}
${existingRole   ? `\nInstrucciones actuales del rol (mejora y compacta esto):\n${existingRole}` : ''}
${roleLearnings  ? `\nAprendizajes del empleado en campo (considera estos patrones reales):\n${roleLearnings}` : ''}

REGLA DE ORO — LONGITUD:
- Objetivo estricto: menos de ${KB_LIMITS.role.soft.toLocaleString('es-MX')} caracteres. Ideal ${Math.round(KB_LIMITS.role.soft * 0.8).toLocaleString('es-MX')}.
- Límite máximo absoluto: ${KB_LIMITS.role.hard.toLocaleString('es-MX')} caracteres. NUNCA lo excedas.

INSTRUCCIONES DE FORMATO:
- Texto plano sin markdown ni asteriscos
- Títulos en MAYÚSCULAS
- Español mexicano natural

GENERA ESTAS SECCIONES (con el estilo indicado arriba):

RESPONSABILIDADES
1-2 líneas de qué hace día a día.

PROCEDIMIENTOS CLAVE
Máximo 2 procesos.

DECISIÓN Y ESCALACIÓN
- Qué resuelve solo / qué escala. Muy breve.

CONTACTOS
- [COMPLETAR: nombre/puesto] para [tipo de asunto]

LÍMITES
- Qué NO hacer sin autorización.`;

  const maxTokens = type === 'business' ? 1_100 : 950;
  const styles: VariantKind[] = ['directo', 'calido', 'estructurado'];

  const results = await Promise.allSettled(
    styles.map(async (style) => {
      const prompt = type === 'business' ? buildBusinessPrompt(style) : buildRolePrompt(style);
      const res = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages:   [{ role: 'user', content: prompt }],
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      return { style, label: STYLE_INSTRUCTIONS[style].label, text };
    }),
  );

  const variants = results
    .map((r, i) => r.status === 'fulfilled' ? r.value : { style: styles[i], label: STYLE_INSTRUCTIONS[styles[i]].label, text: '', error: (r as PromiseRejectedResult).reason?.message ?? 'Error' });

  const anyOk = variants.some(v => v.text.trim().length > 100);
  if (!anyOk)
    return NextResponse.json({ error: 'No se pudo generar ninguna variante' }, { status: 500 });

  // F10.2 Generate-and-filter: si el cliente pidió filter, Claude Sonnet juzga
  // las 3 candidatas contra criterios y devolvemos solo la ganadora + su razón.
  // Costo: 1 llamada adicional Sonnet (juez) además de las 3 Haiku (gen).
  if (filter) {
    const ok = variants.filter(v => v.text.trim().length > 100);
    if (ok.length === 1) {
      return NextResponse.json({ winner: ok[0], reason: 'Solo una variante generada correctamente.', variants });
    }

    const judgePrompt = `Eres un evaluador experto de bases de conocimiento para agentes IA telefónicos en México. Se te presentan ${ok.length} variantes de la MISMA base de conocimiento redactadas en estilos distintos.

CRITERIOS DE JUICIO (en orden de importancia):
1. ACCIONABLE — el agente puede consultarla y actuar sin ambigüedad
2. COBERTURA — menciona los servicios/datos/procesos importantes sin dejar huecos críticos
3. CONCISIÓN — respeta la regla de brevedad (< ${type === 'business' ? KB_LIMITS.business.soft : KB_LIMITS.role.soft} chars ideal)
4. FIDELIDAD — no inventa datos que no estén en la fuente
5. FORMATO — bullets cortos, mayúsculas en títulos, sin markdown ni asteriscos

VARIANTES:

${ok.map((v, i) => `━━━ VARIANTE ${i + 1} (estilo ${v.label}, ${v.text.length} chars) ━━━\n${v.text}\n`).join('\n')}

Responde SOLO en JSON con esta forma exacta, sin markdown ni texto adicional:
{"winner":<índice 1-basado de la variante ganadora>,"reason":"<explicación breve, máximo 200 chars>"}`;

    let winnerIdx = 1;
    let winnerReason = 'Evaluación automática de calidad.';
    try {
      const judgeRes = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 200,
        messages:   [{ role: 'user', content: judgePrompt }],
      });
      const judgeText = judgeRes.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim();
      const parsed = JSON.parse(judgeText) as { winner?: number; reason?: string };
      if (typeof parsed.winner === 'number' && parsed.winner >= 1 && parsed.winner <= ok.length) {
        winnerIdx = parsed.winner;
      }
      if (typeof parsed.reason === 'string' && parsed.reason.trim()) {
        winnerReason = parsed.reason.trim().slice(0, 200);
      }
    } catch {
      // Judge falló; fallback: la variante más cercana al soft limit sin excederlo
      const softLimit = type === 'business' ? KB_LIMITS.business.soft : KB_LIMITS.role.soft;
      let bestScore = -Infinity;
      ok.forEach((v, i) => {
        const overSoft = Math.max(0, v.text.length - softLimit);
        const score = -overSoft - Math.abs(softLimit - v.text.length) * 0.1;
        if (score > bestScore) { bestScore = score; winnerIdx = i + 1; }
      });
      winnerReason = 'Elegida por longitud óptima (juez no disponible).';
    }

    return NextResponse.json({ winner: ok[winnerIdx - 1], reason: winnerReason, variants });
  }

  return NextResponse.json({ variants });
}
