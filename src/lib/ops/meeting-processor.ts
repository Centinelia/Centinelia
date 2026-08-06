import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

export interface MeetingData {
  title:        string;
  date:         string;
  participants: string[];
  summary:      string;
  decisions:    string[];
  action_items: { task: string; assignee: string | null; due: string | null }[];
  next_steps:   string;
}

export async function processMeetingAudio(opts: {
  meetingId:         string;
  agentId:           string;
  audioUrl:          string;
  title:             string;
  participants:      string[];
  ownerEmail:        string;
  businessName:      string;
  knowledgeBase?:    string | null;
  roleKnowledgeBase?: string | null;
  instructions?:     string;
}): Promise<void> {
  const { meetingId, agentId, audioUrl, title, participants, ownerEmail, businessName, knowledgeBase, roleKnowledgeBase, instructions } = opts;
  const supabase = createAdminClient();

  // Guard: si el webhook Vapi reintenta o dos workers procesan al mismo tiempo,
  // solo el primero avanza a processing. Los duplicados abortan sin llamar ElevenLabs+Claude.
  const { data: claimed } = await supabase
    .from('ops_meetings')
    .update({ status: 'processing' })
    .eq('id', meetingId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!claimed) {
    console.info('[meeting-processor] skip: already processed or in progress', meetingId);
    return;
  }

  try {
    // Download audio and transcribe with ElevenLabs STT
    const audioRes  = await fetch(audioUrl);
    const audioBlob = await audioRes.blob();

    const elFormData = new FormData();
    elFormData.append('file', audioBlob, 'meeting.mp4');
    elFormData.append('model_id', 'scribe_v1');
    elFormData.append('language_code', 'es');

    const elRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method:  'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' },
      body:    elFormData,
    });

    if (!elRes.ok) {
      throw new Error(`ElevenLabs STT error: ${elRes.status} ${await elRes.text()}`);
    }

    const elData   = await elRes.json();
    const transcript: string = elData.text ?? elData.transcript ?? '';

    // Ops cost scales with transcript length (1 op per ~2,500 chars, max 6)
    const meetingOps = Math.min(6, Math.max(1, Math.ceil((transcript.length || 1) / 2500)));
    const opsResult  = await consumeAiOp(agentId, meetingOps, { source: 'meeting_processor', label: 'Procesamiento de junta/reunión' });

    if (!opsResult.ok) {
      await supabase.from('ops_meetings').update({
        status:       'done',
        transcript,
        meeting_data: { title, date: new Date().toISOString().slice(0, 10), participants, summary: '', decisions: [], action_items: [], next_steps: '', degraded: true },
        processed_at: new Date().toISOString(),
      }).eq('id', meetingId);
      return;
    }

    // Extract structured data with Claude
    const __t = Date.now();
    const __m = 'claude-haiku-4-5-20251001';
    let msg;
    try {
      msg = await anthropic.messages.create({
      model:      __m,
      max_tokens: 1500,
      system: [{
        type: 'text',
        text: [
          `Eres asistente de oficina de ${businessName}.`,
          knowledgeBase     ? `\n# Conocimiento del negocio\n${knowledgeBase}`  : '',
          roleKnowledgeBase ? `\n# Instrucciones del rol\n${roleKnowledgeBase}` : '',
        ].join(''),
        cache_control: { type: 'ephemeral' },
      }],
      messages:   [{
        role:    'user',
        content: `Analiza la siguiente transcripción de una reunión y extrae la información clave.

Título: ${title}
Participantes: ${participants.join(', ') || 'No especificados'}
Fecha: ${new Date().toLocaleDateString('es-MX')}${instructions ? `\nIndicaciones del usuario: ${instructions}` : ''}

TRANSCRIPCIÓN:
${transcript}

Responde ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "summary": "Resumen ejecutivo de 2-3 oraciones",
  "decisions": ["Decisión 1", "Decisión 2"],
  "action_items": [
    { "task": "Descripción de la tarea", "assignee": "Nombre o null", "due": "Fecha o null" }
  ],
  "next_steps": "Próximos pasos generales en 1-2 oraciones"
}`,
      }],
    });
      void logLlmCall({ source: 'meeting_processor', model: __m, usage: msg.usage, agentId, latencyMs: Date.now() - __t, meta: { meetingId } });
    } catch (err) {
      void logLlmCall({ source: 'meeting_processor', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { meetingId } });
      throw err;
    }

    let extracted: Omit<MeetingData, 'title' | 'date' | 'participants'>;
    try {
      const block = msg.content[0];
      const raw   = block?.type === 'text' ? block.text.trim() : '';
      // Strip markdown code fences if present
      const cleaned   = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch?.[0] ?? '{}');
      if (!extracted.summary) throw new Error('empty');
    } catch {
      extracted = { summary: transcript.slice(0, 600), decisions: [], action_items: [], next_steps: '', parse_failed: true } as any;
    }

    const meetingData: MeetingData = {
      title,
      date:         new Date().toISOString().slice(0, 10),
      participants,
      summary:      extracted.summary ?? '',
      decisions:    extracted.decisions ?? [],
      action_items: extracted.action_items ?? [],
      next_steps:   extracted.next_steps ?? '',
    };

    await supabase
      .from('ops_meetings')
      .update({
        status:       'done',
        transcript,
        meeting_data: meetingData,
        processed_at: new Date().toISOString(),
      })
      .eq('id', meetingId);

    // Send email summary
    await sendEmail({
      to:      ownerEmail,
      subject: `Resumen de junta: ${title}`,
      html:    meetingSummaryHtml({ businessName, meetingData }),
    });

  } catch (err) {
    console.error('[meeting-processor] Error:', err);
    await supabase
      .from('ops_meetings')
      .update({ status: 'error', processed_at: new Date().toISOString() })
      .eq('id', meetingId);
  }
}

function meetingSummaryHtml(opts: { businessName: string; meetingData: MeetingData }): string {
  const { businessName, meetingData } = opts;
  const BG     = '#120726';
  const CARD   = 'rgba(255,255,255,0.055)';
  const BORDER = 'rgba(255,255,255,0.10)';
  const TEXT   = '#e2e8f0';
  const SUB    = 'rgba(255,255,255,0.58)';
  const MUTE   = 'rgba(255,255,255,0.35)';
  const ACCENT = '#9B6DFF';
  const LOGO   = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/logo-tagline.png`;

  const decisionsHtml = meetingData.decisions.length
    ? meetingData.decisions.map(d => `<p style="color:${TEXT};font-size:13px;margin:0 0 6px;padding-left:12px">• ${d}</p>`).join('')
    : `<p style="color:${SUB};font-size:13px;margin:0">Sin decisiones registradas</p>`;

  const actionsHtml = meetingData.action_items.length
    ? meetingData.action_items.map(a => `
    <div style="padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:6px">
      <p style="color:${TEXT};font-size:13px;font-weight:600;margin:0 0 2px">${a.task}</p>
      <p style="color:${SUB};font-size:12px;margin:0">${[a.assignee, a.due].filter(Boolean).join(' · ') || 'Sin asignar'}</p>
    </div>`).join('')
    : `<p style="color:${SUB};font-size:13px;margin:0">Sin tareas asignadas</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(108,59,255,0.15)">
      <tr>
        <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;padding:20px 32px">
          <img src="${LOGO}" alt="Centinelia" width="200" style="width:200px;height:auto;display:inline-block">
        </td>
      </tr>
    </table>
    <div style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:32px">
      <div style="text-align:center;margin-bottom:20px">
        <span style="display:inline-block;background:rgba(108,59,255,0.15);border:1px solid rgba(108,59,255,0.3);border-radius:20px;padding:6px 16px;color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Resumen de Junta</span>
      </div>
      <h1 style="color:${TEXT};font-size:20px;font-weight:700;margin:0 0 4px;text-align:center">${meetingData.title}</h1>
      <p style="color:${SUB};font-size:13px;margin:0 0 24px;text-align:center">${businessName} · ${new Date(meetingData.date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

      <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;padding:16px;margin-bottom:16px">
        <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px">Resumen ejecutivo</p>
        <p style="color:${TEXT};font-size:13px;line-height:1.7;margin:0">${meetingData.summary}</p>
      </div>

      <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;padding:16px;margin-bottom:16px">
        <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">Decisiones</p>
        ${decisionsHtml}
      </div>

      <div style="background:rgba(108,59,255,0.08);border:1px solid rgba(108,59,255,0.2);border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">Tareas y compromisos</p>
        ${actionsHtml}
      </div>

      ${meetingData.next_steps ? `
      <div style="background:rgba(255,255,255,0.03);border:1px solid ${BORDER};border-radius:10px;padding:16px">
        <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px">Próximos pasos</p>
        <p style="color:${TEXT};font-size:13px;line-height:1.7;margin:0">${meetingData.next_steps}</p>
      </div>` : ''}
    </div>
    <div style="text-align:center;padding:24px 0 0">
      <p style="color:${MUTE};font-size:12px;margin:0">
        <a href="https://www.centinelia.mx" style="color:${MUTE};text-decoration:none">centinelia.mx</a>
        &nbsp;·&nbsp;
        <a href="mailto:hola@centinelia.mx" style="color:${ACCENT};text-decoration:none">hola@centinelia.mx</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
