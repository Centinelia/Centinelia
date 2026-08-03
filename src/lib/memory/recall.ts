/**
 * Memory recall — dado un caller number, formatea los facts vigentes de esa
 * persona en un bloque compacto listo para inyectar al system prompt.
 *
 * Se llama al arranque de cada llamada inbound. No trae toda la historia:
 * top-N facts por relevancia (fecha reciente + confidence alto).
 */
import { createPostgresStore } from './postgres-store';
import type { MemoryFact } from './types';

interface RecallResult {
  callerName:  string | null;
  block:       string | null;   // ya formateado listo para inyectar
  factCount:   number;
}

// Descripción legible por predicate para el prompt.
const PREDICATE_ES: Record<string, (f: MemoryFact) => string> = {
  owes:                f => `adeuda ${money(f)}`,
  paid_on:             f => `pagó ${money(f)} el ${date(f)}`,
  promised_to_pay_on:  f => `prometió pagar el ${date(f)}`,
  has_debt_of:         f => `tiene deuda de ${money(f)}`,
  has_credit_of:       f => `tiene saldo a favor de ${money(f)}`,
  lives_at:            f => `vive en ${f.objectText ?? '(sin datos)'}`,
  works_at:            f => `trabaja en ${f.objectText ?? '(sin datos)'}`,
  phone_is:            f => `su teléfono es ${f.objectText ?? '(sin datos)'}`,
  email_is:            f => `su correo es ${f.objectText ?? '(sin datos)'}`,
  called_about:        f => `llamó por "${f.objectText ?? '(sin detalle)'}"`,
  complained_about:    f => `se quejó de "${f.objectText ?? '(sin detalle)'}"`,
  requested:           f => `pidió "${f.objectText ?? '(sin detalle)'}"`,
  scheduled_for:       f => `agendó cita para el ${date(f)}`,
  canceled:            f => `canceló "${f.objectText ?? '(sin detalle)'}"`,
  prefers:             f => `prefiere ${f.objectText ?? '(sin detalle)'}`,
  speaks_language:     f => `habla ${f.objectText ?? '(sin datos)'}`,
  account_status_is:   f => `estatus de cuenta: ${f.objectText ?? '(sin datos)'}`,
};

function money(f: MemoryFact): string {
  if (typeof f.objectNumber !== 'number') return f.objectText ?? '(sin monto)';
  return f.objectNumber.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

function date(f: MemoryFact): string {
  if (!f.objectDate) return '(sin fecha)';
  // objectDate puede venir como 'YYYY-MM-DD' o como full ISO timestamp desde
  // Postgres. Normalizamos a fecha-solo antes de reconstruir con hora medio-día
  // para evitar corrimientos por timezone.
  const dateOnly = String(f.objectDate).slice(0, 10);
  const d = new Date(dateOnly + 'T12:00:00');
  if (isNaN(d.getTime())) return String(f.objectDate);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function recallForCaller(input: {
  agentId:      string;
  callerNumber: string;
  limit?:       number;
}): Promise<RecallResult> {
  const empty: RecallResult = { callerName: null, block: null, factCount: 0 };
  if (!input.callerNumber) return empty;

  try {
    const store = createPostgresStore();
    const res = await store.query({
      agentId:     input.agentId,
      entityPhone: input.callerNumber,
      limit:       input.limit ?? 10,
    });

    if (!res.entity) return empty;

    // Sort facts: newest validFrom first, break ties by higher confidence.
    const facts = [...res.facts].sort((a, b) => {
      const da = new Date(a.validFrom).getTime();
      const db = new Date(b.validFrom).getTime();
      if (db !== da) return db - da;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    });

    if (!facts.length) return { callerName: res.entity.name, block: null, factCount: 0 };

    const lines = facts.map(f => {
      const render = PREDICATE_ES[f.predicate];
      const desc = render ? render(f) : `${f.predicate}: ${f.objectText ?? f.objectNumber ?? f.objectDate ?? ''}`;
      return `- ${desc}`;
    });

    const block = `MEMORIA DE ${res.entity.name.toUpperCase()} (llamadas anteriores — información verificada):
${lines.join('\n')}
Ya conoces este contexto. NO preguntes cosas que ya sabemos aquí. Si el llamante dice algo que contradice lo de arriba, actualiza pero verifica antes de dar por hecho.`;

    return { callerName: res.entity.name, block, factCount: facts.length };
  } catch (err) {
    console.warn('[memory/recall] failed:', err);
    return empty;
  }
}
