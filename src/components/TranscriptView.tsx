'use client';

// Renderiza el transcript de Vapi como turnos alineados. Vapi entrega el
// transcript como texto plano con lineas "Speaker: mensaje" separadas por \n.
// Transcripciones nuevas ya vienen con "<agentName>:" y "Cliente:" (via
// artifactPlan.transcriptPlan), pero las viejas dicen "AI:" y "User:" —
// las normalizamos en display.

const AGENT_ALIASES = new Set(['ai', 'assistant', 'bot', 'agent']);
const USER_ALIASES  = new Set(['user', 'customer', 'human', 'caller']);

type Turn = { speaker: 'agent' | 'user' | 'other'; label: string; text: string };

function parseTranscript(raw: string, agentName?: string): Turn[] {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const turns: Turn[] = [];
  const speakerRe = /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ .'-]{0,40}):\s*(.*)$/;

  for (const line of lines) {
    const m = line.match(speakerRe);
    if (m) {
      const rawSpeaker = m[1].trim();
      const key = rawSpeaker.toLowerCase();
      const text = m[2].trim();
      let speaker: Turn['speaker'] = 'other';
      let label = rawSpeaker;
      if (AGENT_ALIASES.has(key)) { speaker = 'agent'; label = agentName || 'Agente'; }
      else if (USER_ALIASES.has(key)) { speaker = 'user'; label = 'Cliente'; }
      else if (agentName && key === agentName.toLowerCase()) { speaker = 'agent'; label = agentName; }
      else if (key === 'cliente') { speaker = 'user'; label = 'Cliente'; }
      turns.push({ speaker, label, text });
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += (turns[turns.length - 1].text ? ' ' : '') + line;
    } else {
      turns.push({ speaker: 'other', label: '', text: line });
    }
  }
  return turns;
}

export default function TranscriptView({
  transcript, agentName, maxHeight = 220,
}: { transcript: string; agentName?: string; maxHeight?: number }) {
  const turns = parseTranscript(transcript, agentName);

  return (
    <div
      className="rounded-lg overflow-y-auto"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', maxHeight }}
    >
      <div className="flex flex-col gap-2 p-3">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {t.label && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: t.speaker === 'agent' ? '#6C3BFF' : 'var(--c-text-3)' }}
              >
                {t.label}
              </span>
            )}
            <span className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
              {t.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
