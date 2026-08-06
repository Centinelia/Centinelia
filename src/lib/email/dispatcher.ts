// Dispatcher — rutea correos entrantes de la bandeja org-shared al meerkat
// que corresponde atenderlos.
//
// Estrategia (en orden):
//   1. Reglas rápidas — To: matches per-agent email → asignar
//                       subject/body keywords matchean un rol → asignar al meerkat de ese rol
//   2. LLM (Sonnet)   — lee mensaje + roster, devuelve {agent_id, confidence, reason}
//   3. Fallback       — si LLM confidence < 0.5, preferir un agente Sonnet activo
//   4. Escalación     — si no hay agente Sonnet, escalar a humano (agent_id=null)
//
// Salida: DispatchResult que consume email-sync / inbox-processor para
// popular ops_inbox con origin_scope='org_shared' + metadata.

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();
const DISPATCHER_MODEL     = 'claude-sonnet-4-6';
const CONFIDENCE_THRESHOLD = 0.5;

// Meerkats con modelo Sonnet — se usan como fallback preferido y como
// candidatos válidos para tareas de baja confianza.
const SONNET_MEERKATS = new Set(['noah', 'nox', 'niva']);

// ─── Types ────────────────────────────────────────────────────────────────

export interface DispatchInput {
  portalEmail:  string;
  orgEmail:     string;
  /** Agente pivote al que se le cobra la op del dispatcher LLM. Típicamente el
   *  primer agente activo de la org (ya calculado en el sync). Si no se pasa,
   *  el LLM corre sin metering (para tests). */
  pivotAgentId?: string;
  message: {
    id?:      string;
    from:     string;
    to?:      string;
    subject:  string;
    body:     string;
  };
}

export interface DispatchAgent {
  id:              string;
  meerkat_id:      string | null;
  agent_name:      string;
  role:            string | null;
  active:          boolean;
  per_agent_emails: string[];
}

export type AssignedBy = 'rule' | 'llm' | 'fallback' | 'human';

export interface DispatchMetadata {
  rule?:              string;
  llm_reason?:        string;
  alternatives?:      Array<{ agent_id: string; score: number }>;
  org_email:          string;
  escalated?:         boolean;
  escalated_reason?:  string;
}

export interface DispatchResult {
  agentId:     string | null;      // null → escalar a humano
  assignedBy:  AssignedBy;
  confidence:  number;             // 0..1
  metadata:    DispatchMetadata;
}

// ─── Reglas ───────────────────────────────────────────────────────────────

// Palabras clave por grupo de rol.
const ROLE_KEYWORDS: Record<string, RegExp[]> = {
  ventas:     [/cotiza/i, /precio/i, /comprar/i, /pedido/i, /interesad/i, /pres[uú]puesto/i, /propuesta/i],
  cobranza:   [/pago pendiente/i, /factura vencida/i, /cobranza/i, /adeudo/i, /saldo pendiente/i, /pago atrasad/i],
  soporte:    [/no funciona/i, /error/i, /problema/i, /soporte t[eé]cnico/i, /queja/i, /reclamo/i],
  factura:    [/factura/i, /cfdi/i, /timbra/i, /uso de cfdi/i, /datos fiscales/i, /\brfc\b/i],
  recepcion:  [/agendar/i, /cita/i, /horario/i, /informaci[oó]n general/i, /contacto/i],
  rrhh:       [/vacaciones/i, /permiso/i, /incapacidad/i, /n[oó]mina/i, /empleado nuevo/i, /baja de personal/i],
  helpdesk:   [/soporte it/i, /accesos/i, /contrase[nñ]a/i, /vpn/i, /impresora/i, /correo no funciona/i],
};

// Mapping: grupo de rol → meerkat_ids candidatos (en orden de preferencia).
const ROLE_TO_MEERKAT: Record<string, string[]> = {
  ventas:    ['noah'],
  cobranza:  ['nico'],
  soporte:   ['nelia', 'neo'],
  factura:   ['nico', 'noah'],
  recepcion: ['nia'],
  rrhh:      ['naia'],
  helpdesk:  ['neo'],
};

// ─── Entry point ──────────────────────────────────────────────────────────

export async function dispatchEmail(input: DispatchInput): Promise<DispatchResult> {
  const supabase = createAdminClient();
  const agents = await loadActiveAgents(input.portalEmail, supabase);

  if (agents.length === 0) {
    return escalate(input.orgEmail, 'No hay empleados activos en esta organización');
  }

  const ruleResult = tryRules(input.message, agents);
  if (ruleResult) return finalize(ruleResult, input.orgEmail);

  // Metering: la llamada Sonnet consume 1 op. Se cobra al pivote (típicamente
  // el primer agente activo). Si la cuenta está sin quota, saltamos el LLM y
  // caemos al fallback directo — evita cargar operaciones no cobradas.
  let llmAllowed = true;
  if (input.pivotAgentId) {
    try {
      const gate = await consumeAiOp(input.pivotAgentId, 1, {
        source:       'org_dispatcher',
        reference_id: input.message.id,
        label:        'Ruteo de correo compartido',
        context:      `Bandeja compartida (${input.orgEmail}) — asunto: ${input.message.subject.slice(0, 120)}`,
      });
      llmAllowed = gate.ok;
    } catch (err) {
      console.error('[dispatcher] consumeAiOp error, skipping LLM:', err);
      llmAllowed = false;
    }
  }

  const llmResult = llmAllowed
    ? await tryLLM(input.message, agents, input.portalEmail, input.pivotAgentId)
    : null;
  if (llmResult && llmResult.confidence >= CONFIDENCE_THRESHOLD) {
    return finalize(llmResult, input.orgEmail);
  }

  // Fallback: preferir Sonnet
  const sonnet = agents.find(a => a.meerkat_id && SONNET_MEERKATS.has(a.meerkat_id));
  if (sonnet) {
    return finalize({
      agentId:    sonnet.id,
      assignedBy: 'fallback',
      confidence: 0.3,
      metadata:   {
        rule:            llmAllowed ? 'sonnet_fallback' : 'sonnet_fallback_no_quota',
        llm_reason:      llmResult?.metadata.llm_reason,
      },
    }, input.orgEmail);
  }

  return escalate(
    input.orgEmail,
    llmAllowed
      ? 'Sin agente Sonnet activo y confianza del LLM < 0.5'
      : 'Sin quota IA para dispatcher y sin agente Sonnet activo',
    llmResult?.metadata.llm_reason,
  );
}

// ─── Roster loader ────────────────────────────────────────────────────────

async function loadActiveAgents(portalEmail: string, supabase: SupabaseClient): Promise<DispatchAgent[]> {
  const { data: voiceAgents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, active, features')
    .eq('portal_email', portalEmail)
    .eq('active', true);

  if (!voiceAgents?.length) return [];

  const agentIds = voiceAgents.map(a => a.id as string);
  const { data: emails } = await supabase
    .from('email_integrations')
    .select('agent_id, email, send_as_email')
    .in('agent_id', agentIds);

  const emailsByAgent = new Map<string, string[]>();
  for (const row of (emails ?? []) as Array<{ agent_id: string; email: string; send_as_email: string | null }>) {
    const list = emailsByAgent.get(row.agent_id) ?? [];
    if (row.email)         list.push(row.email);
    if (row.send_as_email) list.push(row.send_as_email);
    emailsByAgent.set(row.agent_id, list);
  }

  return voiceAgents.map(a => ({
    id:               a.id as string,
    agent_name:       (a.agent_name as string | null) ?? 'Empleado',
    role:             (a.role as string | null) ?? null,
    active:           a.active as boolean,
    meerkat_id:       ((a.features as Record<string, unknown> | null)?.meerkat_role_id as string | null) ?? null,
    per_agent_emails: emailsByAgent.get(a.id as string) ?? [],
  }));
}

// ─── Rules pass ───────────────────────────────────────────────────────────

type PartialResult = Omit<DispatchResult, 'metadata'> & { metadata: Omit<DispatchMetadata, 'org_email'> };

function tryRules(msg: DispatchInput['message'], agents: DispatchAgent[]): PartialResult | null {
  // Regla 1: To: matches per-agent email
  const to = (msg.to ?? '').toLowerCase();
  if (to) {
    for (const agent of agents) {
      for (const email of agent.per_agent_emails) {
        if (email && to.includes(email.toLowerCase())) {
          return {
            agentId:    agent.id,
            assignedBy: 'rule',
            confidence: 1.0,
            metadata:   { rule: `to_match:${email}` },
          };
        }
      }
    }
  }

  // Regla 2: keywords en subject o primeros 500 chars del body → rol → meerkat activo
  const text = `${msg.subject} ${msg.body.slice(0, 500)}`;
  for (const [roleGroup, patterns] of Object.entries(ROLE_KEYWORDS)) {
    if (patterns.some(p => p.test(text))) {
      const candidateMeerkats = ROLE_TO_MEERKAT[roleGroup] ?? [];
      const match = agents.find(a => a.meerkat_id && candidateMeerkats.includes(a.meerkat_id));
      if (match) {
        return {
          agentId:    match.id,
          assignedBy: 'rule',
          confidence: 0.85,
          metadata:   { rule: `role_kw:${roleGroup}` },
        };
      }
    }
  }

  return null;
}

// ─── LLM pass ─────────────────────────────────────────────────────────────

async function tryLLM(
  msg:          DispatchInput['message'],
  agents:       DispatchAgent[],
  portalEmail?: string,
  agentId?:     string,
): Promise<PartialResult | null> {
  const start = Date.now();
  try {
    const rosterLines = agents.map(a => {
      const model = a.meerkat_id ? getMeerkatModelLabel(a.meerkat_id) : 'custom';
      return `- id=${a.id} | ${a.agent_name} | meerkat=${a.meerkat_id ?? 'custom'} | modelo=${model} | rol=${a.role ?? '(sin rol)'}`;
    }).join('\n');

    const prompt =
`Recibiste un correo en la bandeja COMPARTIDA de una organización. Tu trabajo es asignarlo al empleado digital cuyo rol le corresponde atenderlo.

CORREO ENTRANTE:
De:      ${msg.from}
Para:    ${msg.to ?? '(no especificado)'}
Asunto:  ${msg.subject}
Cuerpo (primeros 800 chars):
${msg.body.slice(0, 800)}

EMPLEADOS ACTIVOS DE LA ORG:
${rosterLines}

INSTRUCCIONES:
Responde ÚNICAMENTE con un JSON válido:
{"agent_id":"<uuid>","confidence":<0..1>,"reason":"<breve explicación en español>"}

Guía de confianza:
- 0.9-1.0 → el correo mencionó explícitamente el rol del empleado o pertenece claramente a su dominio
- 0.7-0.9 → inferencia sólida por rol
- 0.5-0.7 → inferencia razonable pero podría ser otro empleado
- <0.5    → no hay match claro, devuelve el mejor guess con confidence baja

Sin markdown, sin texto extra, solo el JSON.`;

    const resp = await anthropic.messages.create({
      model:       DISPATCHER_MODEL,
      max_tokens:  250,
      temperature: 0.1,
      messages:    [{ role: 'user', content: prompt }],
    });

    // Observabilidad: registrar la llamada (tokens, costo, latencia)
    await logLlmCall({
      source:      'org_dispatcher',
      model:       DISPATCHER_MODEL,
      usage:       resp.usage,
      agentId,
      portalEmail,
      latencyMs:   Date.now() - start,
      meta:        { msg_id: msg.id, subject: msg.subject.slice(0, 120) },
    }).catch(err => console.error('[dispatcher] logLlmCall error:', err));

    const first = resp.content[0];
    const text  = first && first.type === 'text' ? first.text.trim() : '';
    if (!text) return null;

    // Robustez: aceptar JSON con o sin fences accidentales
    const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    const parsed  = JSON.parse(cleaned) as { agent_id?: string; confidence?: number; reason?: string };

    if (!parsed.agent_id || typeof parsed.confidence !== 'number') return null;
    if (!agents.some(a => a.id === parsed.agent_id)) return null;

    return {
      agentId:    parsed.agent_id,
      assignedBy: 'llm',
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      metadata:   { llm_reason: parsed.reason ?? '' },
    };
  } catch (err) {
    console.error('[dispatcher] LLM error:', err);
    await logLlmCall({
      source:      'org_dispatcher',
      model:       DISPATCHER_MODEL,
      usage:       { input_tokens: 0, output_tokens: 0 },
      agentId,
      portalEmail,
      latencyMs:   Date.now() - start,
      error:       String(err).slice(0, 500),
    }).catch(() => {});
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getMeerkatModelLabel(meerkatId: string): 'Sonnet' | 'Haiku' {
  const versions = MEERKAT_CONFIGS[meerkatId];
  if (!versions) return 'Haiku';
  const latest = versions[Math.max(...Object.keys(versions).map(Number))];
  return latest?.model.includes('sonnet') ? 'Sonnet' : 'Haiku';
}

function finalize(partial: PartialResult, orgEmail: string): DispatchResult {
  return {
    ...partial,
    metadata: { ...partial.metadata, org_email: orgEmail },
  };
}

function escalate(orgEmail: string, reason: string, llmReason?: string): DispatchResult {
  return {
    agentId:    null,
    assignedBy: 'human',
    confidence: 0,
    metadata:   {
      org_email:        orgEmail,
      escalated:        true,
      escalated_reason: reason,
      ...(llmReason ? { llm_reason: llmReason } : {}),
    },
  };
}
