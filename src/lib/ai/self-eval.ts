import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic();

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Lead capturado',
  appointment_booked: 'Cita agendada',
  order_taken:        'Pedido tomado',
  transferred:        'Transferida al equipo',
  info_provided:      'Información proporcionada',
  escalated_whatsapp: 'Escalada a WhatsApp',
  missed:             'Llamada perdida',
  other:              'Completada',
};

export async function selfEvalCall(opts: {
  callId:     string;
  transcript: string;
  outcome:    string;
  dod:        string | null;
  guardrails: string | null;
}): Promise<void> {
  const { callId, transcript, outcome, dod, guardrails } = opts;

  const lines: string[] = [
    `RESULTADO DE LA LLAMADA: ${OUTCOME_LABELS[outcome] ?? outcome}`,
    '',
    'TRANSCRIPT:',
    transcript.slice(0, 5000),
  ];

  if (dod?.trim()) {
    lines.push('', 'DEFINICIÓN DE ÉXITO (lo que debías lograr):', dod.trim());
  }

  if (guardrails?.trim()) {
    lines.push('', 'LÍMITES DE AUTORIDAD (lo que NO debías hacer):', guardrails.trim());
  }

  lines.push(`
Evalúa el desempeño del empleado de forma objetiva. Responde ÚNICAMENTE con JSON válido:
{
  "score": <número del 1 al 5>,
  "notes": "<2-3 oraciones concisas: qué hizo bien y qué puede mejorar>"
}

Escala:
5 = Excelente: objetivo logrado, límites respetados, comunicación impecable
4 = Muy bueno: objetivo logrado con áreas menores de mejora
3 = Regular: objetivo logrado parcialmente o con dificultades notables
2 = Deficiente: objetivo no logrado o errores importantes
1 = Crítico: límites de autoridad violados o problemas graves generados`);

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role:    'user',
      content: lines.join('\n'),
    }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return;

  let parsed: { score?: unknown; notes?: unknown };
  try { parsed = JSON.parse(match[0]); } catch { return; }

  const score = typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : null;
  const notes = typeof parsed.notes === 'string' ? parsed.notes.trim().slice(0, 500) : null;

  if (!score || !notes) return;

  const supabase = createAdminClient();
  await supabase
    .from('voice_calls')
    .update({ self_eval_score: score, self_eval_notes: notes, self_eval_at: new Date().toISOString() })
    .eq('id', callId);
}
