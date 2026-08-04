/**
 * Post-call survey dispatch — mira las llamadas terminadas hace >delay minutos
 * cuyo caller tiene email conocido (via leads_voice.email o llamada previa),
 * y para cada org con encuesta opt-in dispara un correo con link a la vista
 * pública. El token del link es HMAC firmado — el destinatario no puede
 * responder por otro caller ni cambiar el survey.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

type SupabaseClient = ReturnType<typeof createAdminClient>;

function secret(): string {
  const s = process.env.SURVEY_TOKEN_SECRET ?? process.env.PORTAL_SESSION_SECRET;
  if (!s) throw new Error('SURVEY_TOKEN_SECRET or PORTAL_SESSION_SECRET must be set');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str: string): Buffer {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(pad + '=='.slice(0, (4 - pad.length % 4) % 4), 'base64');
}

/** Signs `${surveyId}|${callId}|${caller}|${exp}` → base64url payload + sig. */
export function signSurveyToken(args: {
  surveyId: string;
  callId?:  string | null;
  caller?:  string | null;
  ttlDays?: number;
}): string {
  const exp = Date.now() + (args.ttlDays ?? 14) * 24 * 60 * 60 * 1000;
  const data = `${args.surveyId}|${args.callId ?? ''}|${args.caller ?? ''}|${exp}`;
  const sig  = createHmac('sha256', secret()).update(data).digest();
  return `${b64url(Buffer.from(data))}.${b64url(sig)}`;
}

export interface VerifiedToken {
  surveyId: string;
  callId:   string | null;
  caller:   string | null;
  exp:      number;
}

export function verifySurveyToken(token: string): VerifiedToken | null {
  try {
    const [dataB64, sigB64] = token.split('.');
    if (!dataB64 || !sigB64) return null;
    const data = fromB64url(dataB64);
    const sig  = fromB64url(sigB64);
    const expected = createHmac('sha256', secret()).update(data).digest();
    if (expected.length !== sig.length || !timingSafeEqual(expected, sig)) return null;
    const [surveyId, callId, caller, expStr] = data.toString('utf8').split('|');
    const exp = Number(expStr);
    if (!surveyId || !exp || exp < Date.now()) return null;
    return { surveyId, callId: callId || null, caller: caller || null, exp };
  } catch {
    return null;
  }
}

/**
 * Look up the caller's email by matching the caller_number against WhatsApp
 * numbers or explicit emails in leads_voice for this agent. Falls back to null.
 */
async function findCallerEmail(supabase: SupabaseClient, agentId: string, callerNumber: string | null): Promise<string | null> {
  if (!callerNumber) return null;
  const digits = callerNumber.replace(/\D/g, '').slice(-10);
  if (digits.length < 7) return null;
  const { data } = await supabase
    .from('leads_voice')
    .select('email, whatsapp')
    .eq('agent_id', agentId)
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);
  const match = (data ?? []).find(l => (String(l.whatsapp ?? '').replace(/\D/g, '').slice(-10)) === digits);
  return match?.email as string | null ?? null;
}

function surveyEmailHtml(args: {
  agentName:    string;
  businessName: string;
  surveyName:   string;
  link:         string;
  brandColor:   string;
}): string {
  const { agentName, businessName, surveyName, link, brandColor } = args;
  return `<!doctype html><html><body style="margin:0;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="max-width:500px;margin:32px auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">${businessName}</div>
      <h1 style="margin:6px 0 20px 0;font-size:20px;color:#1a0a3b">Gracias por tu llamada</h1>
      <p style="margin:0 0 16px 0;line-height:1.6;color:#1a0a3b">Hola, soy ${agentName}. Nos ayudaría mucho tu opinión sobre la llamada: son 30 segundos.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:${brandColor};color:#fff;text-decoration:none;border-radius:8px;font-weight:500">Responder encuesta — "${surveyName}"</a>
      </div>
      <p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.5">Si no puedes contestar ahora, el enlace estará activo por 14 días. Si prefieres no participar, ignora este correo.</p>
    </div>
  </body></html>`;
}

export interface DispatchResult {
  callsChecked:  number;
  emailsSent:    number;
  skippedNoOptIn:number;
  skippedNoEmail:number;
  errors:        { call_id: string; error: string }[];
}

/**
 * Runs one pass of the post-call survey dispatch.
 *   - Window: calls ended between (now - lookbackHours) and (now - delayMinutes)
 *   - Skip if survey_email_sent_at IS NOT NULL
 *   - Skip if org has no active survey with dispatch_via_email_post_call
 *   - Skip if caller email unknown
 */
export async function runPostCallSurveyDispatch(opts?: {
  now?:            Date;
  lookbackHours?:  number;
}): Promise<DispatchResult> {
  const supabase     = createAdminClient();
  const now          = opts?.now ?? new Date();
  const lookback     = (opts?.lookbackHours ?? 12) * 3600_000;
  const lookbackIso  = new Date(now.getTime() - lookback).toISOString();

  const result: DispatchResult = { callsChecked: 0, emailsSent: 0, skippedNoOptIn: 0, skippedNoEmail: 0, errors: [] };

  const { data: calls } = await supabase
    .from('voice_calls')
    .select('id, agent_id, caller_number, ended_at, created_at')
    .is('survey_email_sent_at', null)
    .gte('created_at', lookbackIso)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: true })
    .limit(200);

  if (!calls?.length) return result;

  // Group by agent → org → active surveys with opt-in
  const agentIds = [...new Set(calls.map(c => c.agent_id as string))];
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, brand_color, portal_email')
    .in('id', agentIds);
  const agentMap = new Map<string, any>();
  for (const a of agents ?? []) agentMap.set(a.id, a);

  // Per-agent survey lookup: which agents have any active survey with dispatch_via_email_post_call?
  const { data: eligibleSurveys } = await supabase
    .from('surveys')
    .select('id, agent_id, nombre, dispatch_delay_min')
    .in('agent_id', agentIds)
    .eq('activa', true)
    .eq('dispatch_via_email_post_call', true);
  const surveysByAgent = new Map<string, { id: string; nombre: string; delay: number }>();
  for (const s of eligibleSurveys ?? []) {
    // If multiple, keep first (survey UI should enforce one active post-call).
    if (!surveysByAgent.has(s.agent_id as string)) {
      surveysByAgent.set(s.agent_id as string, {
        id:     s.id as string,
        nombre: s.nombre as string,
        delay:  Number(s.dispatch_delay_min ?? 30),
      });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  for (const call of calls) {
    result.callsChecked++;
    const agent = agentMap.get(call.agent_id as string);
    if (!agent) continue;

    const survey = surveysByAgent.get(call.agent_id as string);
    if (!survey) { result.skippedNoOptIn++; continue; }

    // Enforce delay: skip if call ended too recently
    const endedAt = new Date(call.ended_at as string).getTime();
    if (now.getTime() - endedAt < survey.delay * 60_000) continue;

    try {
      const email = await findCallerEmail(supabase, agent.id, call.caller_number as string | null);
      if (!email) {
        // Mark as attempted so we don't re-scan forever, but count as skipped.
        await supabase.from('voice_calls').update({ survey_email_sent_at: now.toISOString() }).eq('id', call.id);
        result.skippedNoEmail++;
        continue;
      }

      const token = signSurveyToken({ surveyId: survey.id, callId: call.id as string, caller: call.caller_number as string });
      const link  = `${appUrl}/s/${token}`;

      await sendEmail({
        to:      email,
        subject: `Encuesta — ${survey.nombre}`,
        html:    surveyEmailHtml({
          agentName:    agent.agent_name ?? 'Centinelia',
          businessName: agent.business_name ?? '',
          surveyName:   survey.nombre,
          link,
          brandColor:   agent.brand_color ?? '#6C3BFF',
        }),
      });

      await supabase.from('voice_calls').update({ survey_email_sent_at: now.toISOString() }).eq('id', call.id);
      result.emailsSent++;
    } catch (err) {
      result.errors.push({ call_id: call.id as string, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
