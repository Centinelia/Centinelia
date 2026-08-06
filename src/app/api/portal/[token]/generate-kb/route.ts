import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { KB_LIMITS } from '@/lib/portal/kb-limits';
import { logLlmCall } from '@/lib/observability/llm-log';

export const dynamic = 'force-dynamic';

const OPS_COST = 3;

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const { type, role } = await req.json() as { type: 'business' | 'role'; role?: string };

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

  // IDOR guard: session must belong to the same account as the token
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const ops = await consumeAiOp(agent.id, OPS_COST, { source: 'generate_kb', label: 'Generación de manual con IA' });
  if (!ops.ok)
    return NextResponse.json(
      { error: `Sin tareas disponibles (${ops.used}/${ops.limit} usadas)` },
      { status: 402 }
    );

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 });

  // Org-level fields come from organizations table
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

  // Format business hours for the prompt
  let hoursText: string | null = null;
  if (hours && typeof hours === 'object') {
    const days: Record<string, string> = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo' };
    const lines = Object.entries(hours as Record<string, { open: string; close: string; closed?: boolean }>)
      .map(([d, v]) => v.closed ? `${days[d] ?? d}: Cerrado` : `${days[d] ?? d}: ${v.open} – ${v.close}`)
      .filter(Boolean);
    if (lines.length) hoursText = lines.join('\n');
  }

  let prompt: string;

  if (type === 'business') {
    prompt = `Eres un especialista en bases de conocimiento para negocios en México. Genera una base de conocimiento COMPACTA y accionable para un agente IA telefónico.

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
- Prefiere frases telegráficas: "Corte: $150" en vez de "El servicio de corte de cabello tiene un costo de $150 pesos mexicanos".
- Bullets cortos, no párrafos. Menos es más — el agente lo consulta mientras habla con el cliente.

INSTRUCCIONES DE FORMATO:
- Texto plano sin markdown, sin asteriscos, sin guiones largos
- Títulos de sección en MAYÚSCULAS
- Elementos con guión (-)
- Español mexicano natural
- Usa datos reales del sitio web cuando estén disponibles
- Solo usa [COMPLETAR: descripción] para datos que genuinamente no puedas inferir
- Si un dato no se puede resumir en 1 línea, omítelo — irá en Drive donde el agente puede buscarlo

GENERA ESTAS SECCIONES (todas cortas):

QUÉ HACEMOS
1-2 líneas.

SERVICIOS Y PRECIOS
Lista telegráfica, un renglón por servicio.

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

  } else {
    prompt = `Eres un especialista en procesos operativos para negocios en México. Genera instrucciones COMPACTAS para un empleado IA con un rol específico.

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
- Bullets cortos, no párrafos. El empleado lo consulta rapidísimo mientras trabaja.

INSTRUCCIONES DE FORMATO:
- Texto plano sin markdown ni asteriscos
- Títulos en MAYÚSCULAS, elementos con guión (-) o numerados
- Español mexicano natural
- Solo usa [COMPLETAR: descripción] para datos que genuinamente no puedas inferir

GENERA ESTAS SECCIONES (cortas):

RESPONSABILIDADES
1-2 líneas de qué hace día a día.

PROCEDIMIENTOS CLAVE
Máximo 2 procesos, cada uno con 3-5 pasos numerados.

DECISIÓN Y ESCALACIÓN
- Qué resuelve solo / qué escala. Muy breve.

CONTACTOS
- [COMPLETAR: nombre/puesto] para [tipo de asunto]

LÍMITES
- Qué NO hacer sin autorización.`;
  }

  // max_tokens ajustado a los nuevos hard limits: business ~4k chars = ~1k tokens,
  // role ~3.5k chars = ~875 tokens. Le damos margen pero no tanto que el modelo
  // se sienta con licencia para expandirse.
  const maxTokens = type === 'business' ? 1_100 : 950;

  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  const stream = client.messages.stream({
    model:      __m,
    max_tokens: maxTokens,
    messages:   [{ role: 'user', content: prompt }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
          }
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        try {
          const finalMsg = await stream.finalMessage();
          void logLlmCall({ source: 'generate_kb', model: __m, usage: finalMsg.usage, agentId: agent.id, portalEmail: agent.portal_email ?? null, latencyMs: Date.now() - __t, meta: { type } });
        } catch { /* ignore */ }
      } catch (err) {
        void logLlmCall({ source: 'generate_kb', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id, portalEmail: agent.portal_email ?? null, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { type } });
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'Error generando la base de conocimiento' })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
