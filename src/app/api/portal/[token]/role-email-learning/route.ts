export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { refreshIfNeeded } from '@/lib/connectors';
import type { IntegrationRow } from '@/lib/connectors';
import { fetchRecentGmail, fetchRecentOutlook } from '@/lib/email/fetch-recent';
import { saveLearnings } from '@/lib/ai/save-learning';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; agent_name: string | null; business_name: string; role: string | null; role_knowledge_base: string | null; portal_email: string | null }>(token, 'id, agent_name, business_name, role, role_knowledge_base, portal_email', supabase);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // El correo de aprendizaje es el CORREO DE LA ORG, no del empleado.
  // Un empleado no aprende a hablar como la marca leyendo sus propios drafts
  // — aprende leyendo la bandeja del negocio (hola@empresa.com), que es la
  // fuente de verdad del tono/reglas del negocio. Primero busca per-org
  // (integration_accounts). Fallback per-agent (email_integrations) solo
  // por retrocompat con conexiones viejas.
  let integration: IntegrationRow | null = null;

  if (agent.portal_email) {
    const { data: orgAcct } = await supabase
      .from('integration_accounts')
      .select('provider, account_label, access_token, refresh_token, expires_at, status')
      .eq('portal_email', agent.portal_email)
      .in('provider', ['gmail', 'outlook'])
      .maybeSingle();

    if (orgAcct) {
      integration = {
        id:                 `org:${agent.portal_email}:${orgAcct.provider}`,
        agent_id:           agent.id as string,
        provider:           orgAcct.provider as 'gmail' | 'outlook',
        email:              (orgAcct.account_label as string | null) ?? '',
        access_token:       (orgAcct.access_token as string | null) ?? '',
        refresh_token:      (orgAcct.refresh_token as string | null) ?? null,
        token_expires_at:   (orgAcct.expires_at as string | null) ?? null,
        last_sync_at:       null,
        needs_reauth:       orgAcct.status === 'needs_reauth',
        reauth_notified_at: null,
      };
    }
  }

  if (!integration) {
    const { data: perAgent } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('agent_id', agent.id)
      .maybeSingle();
    if (perAgent) integration = perAgent as IntegrationRow;
  }

  if (!integration) {
    return NextResponse.json(
      { error: 'Sin correo del negocio conectado. Conecta Gmail o Outlook en Oficina → Integraciones.' },
      { status: 422 },
    );
  }

  if (integration.needs_reauth) {
    return NextResponse.json(
      { error: 'La conexión de correo requiere reautorizarse. Ve a Oficina → Integraciones para reconectarla.' },
      { status: 422 },
    );
  }

  // Refresh token if needed
  const accessToken = await refreshIfNeeded(integration as IntegrationRow, supabase);

  // Fetch last 30 days of emails PRIMERO — cero costo LLM, solo API call
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const emails = (integration as IntegrationRow).provider === 'gmail'
    ? await fetchRecentGmail(accessToken, since)
    : await fetchRecentOutlook(accessToken, since);

  // Probe: si no hay correos, devolver 422 SIN cobrar. Fix 2026-08-10.
  if (!emails.length) {
    return NextResponse.json(
      { error: 'No se encontraron correos en los últimos 30 días. No se consumieron tareas.' },
      { status: 422 },
    );
  }

  // Consume 5 ops (solo si sí hay correos para analizar)
  const opsResult = await consumeAiOp(agent.id, 5, { source: 'role_email_learning', label: 'Aprendizaje del rol desde correos' });
  if (!opsResult.ok) {
    return NextResponse.json({ error: 'Sin tareas disponibles para esta operación.' }, { status: 402 });
  }

  // Build email list for prompt (anonymized subjects + snippets only)
  const emailLines = emails.slice(0, 60).map((e, i) =>
    `${i + 1}. Asunto: "${e.subject.slice(0, 100)}" | Preview: "${e.snippet.slice(0, 150)}"`,
  ).join('\n');

  const roleCtx = [
    (agent.role as string | null)?.trim(),
    (agent.role_knowledge_base as string | null)?.trim()?.slice(0, 800),
  ].filter(Boolean).join('\n');

  const prompt = `Eres un extractor de conocimiento de negocios. Tu tarea es identificar reglas de decisión implícitas relevantes para un rol específico, a partir de correos de un negocio.

NEGOCIO: ${agent.business_name}
ROL DEL EMPLEADO: ${(agent.role as string | null)?.trim() || 'Asistente general'}
${roleCtx ? `\nCONTEXTO DEL ROL:\n${roleCtx}` : ''}

CORREOS RECIENTES DEL NEGOCIO (${emails.length} correos, últimos 30 días):
${emailLines}

INSTRUCCIONES:
1. Identifica cuáles correos son RELEVANTES para el rol descrito (ignora los que no tienen relación)
2. De los relevantes, extrae las reglas de decisión que el empleado debería conocer: cómo se toman decisiones, qué se aprueba, qué se escala, qué políticas informales existen
3. Asigna una confianza del 0 al 1 por cada regla: 1.0 = evidencia clara en múltiples correos, 0.5 = inferencia razonable

RESTRICCIONES IMPORTANTES:
- NO incluyas nombres de personas ni datos de clientes identificables
- Solo incluye patrones y reglas generales, no casos únicos
- Solo incluye lo que haya evidencia clara en los correos
- Si no hay correos relevantes al rol, responde con learnings vacío

Responde ÚNICAMENTE con JSON válido:
{
  "relevant_count": <número de correos relevantes al rol>,
  "learnings": [
    { "content": "Regla concreta y accionable que el empleado puede aplicar", "confidence": 0.90 },
    { "content": "Otra regla", "confidence": 0.65 }
  ]
}

Máximo 8 aprendizajes. Las reglas deben ser aplicables, no observaciones vagas.`;

  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  let response;
  try {
    response = await anthropic.messages.create({
      model:      __m,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    void logLlmCall({ source: 'role_email_learning', model: __m, usage: response.usage, agentId: agent.id as string, latencyMs: Date.now() - __t });
  } catch (err) {
    void logLlmCall({ source: 'role_email_learning', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id as string, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: 'Error al procesar el análisis.' }, { status: 500 });

  let parsed: { relevant_count?: number; learnings?: unknown[] };
  try { parsed = JSON.parse(match[0]); } catch {
    return NextResponse.json({ error: 'Error al procesar el análisis.' }, { status: 500 });
  }

  const extracted = (parsed.learnings ?? [])
    .filter((l): l is { content: string; confidence: number } =>
      typeof (l as any)?.content === 'string' &&
      (l as any).content.trim().length > 10 &&
      typeof (l as any)?.confidence === 'number',
    )
    .slice(0, 8);

  if (!extracted.length) {
    return NextResponse.json({
      saved:          0,
      relevant_count: parsed.relevant_count ?? 0,
      total_emails:   emails.length,
      message:        'No se encontraron correos relevantes para el rol de este empleado en los últimos 30 días.',
    });
  }

  const saved = await saveLearnings(
    extracted.map(e => ({
      agentId:     agent.id as string,
      portalEmail: agent.portal_email as string | null,
      content:     e.content.trim().slice(0, 500),
      confidence:  1,  // email learnings are user-triggered — auto-approve all
      source:      'email' as const,
    })),
  );

  return NextResponse.json({
    saved,
    relevant_count: parsed.relevant_count ?? extracted.length,
    total_emails:   emails.length,
  });
}
