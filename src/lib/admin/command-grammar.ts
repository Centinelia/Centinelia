/**
 * Grammar del command line del admin (C2 de la iniciativa Company OS).
 *
 * Principio del artículo: deterministic first, model as fallback. Comandos
 * frecuentes tienen forma fija y una acción conocida — se parsean local,
 * dispatch directo, cero tokens.
 *
 * Los que no matchean caen al fallback (Claude), pero eso vive en la ruta,
 * no aquí. Este archivo es 100% puro: regex → objeto tipado.
 */

export type Command =
  | { kind: 'help' }
  | { kind: 'budget_report' }
  | { kind: 'burn_report' }
  | { kind: 'list_agents';    filter: 'active' | 'inactive' | 'all' }
  | { kind: 'find_agent';     query: string }
  | { kind: 'health';         portalEmail: string }
  | { kind: 'reset_ops';      portalEmail: string }
  | { kind: 'grant_ops';      portalEmail: string; count: number }
  | { kind: 'reset_minutes';  portalEmail: string };

export type ParseResult =
  | { ok: true;  command: Command; trace: string }
  | { ok: false; error: string;    suggestion?: string };

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;

interface CmdSpec {
  name:   string;
  regex:  RegExp;
  build:  (m: RegExpMatchArray) => Command;
  trace:  (m: RegExpMatchArray) => string;
  help:   string;
}

const SPECS: CmdSpec[] = [
  {
    name:  'help',
    regex: /^\s*(help|ayuda|\?)\s*$/i,
    build: () => ({ kind: 'help' }),
    trace: () => 'help — lista de comandos',
    help:  '`help` — lista los comandos disponibles',
  },
  {
    name:  'budget report',
    regex: /^\s*(budget|presupuesto)(\s+report)?\s*$/i,
    build: () => ({ kind: 'budget_report' }),
    trace: () => 'budget report — saldo Vapi, Twilio, ops y proyección Claude',
    help:  '`budget report` — saldos Vapi + Twilio + estimación Claude del mes',
  },
  {
    name:  'burn report',
    regex: /^\s*(burn|gasto)(\s+report)?\s*$/i,
    build: () => ({ kind: 'burn_report' }),
    trace: () => 'burn report — top agentes por ops consumidas este mes',
    help:  '`burn report` — top 10 agentes por ops usadas este mes',
  },
  {
    name:  'list agents',
    regex: /^\s*(list|listar)\s+agent(e)?s?(\s+(active|activos|inactive|inactivos|all|todos))?\s*$/i,
    build: (m) => {
      const raw = (m[4] ?? '').toLowerCase();
      const filter: 'active' | 'inactive' | 'all' =
        raw === 'inactive' || raw === 'inactivos' ? 'inactive' :
        raw === 'all'      || raw === 'todos'     ? 'all'      :
        'active';
      return { kind: 'list_agents', filter };
    },
    trace: (m) => `list agents ${(m[4] ?? 'active').toLowerCase()}`,
    help:  '`list agents [active|inactive|all]` — top 20 agentes con métricas',
  },
  {
    name:  'find agent',
    regex: /^\s*(find|buscar)\s+agent(e)?\s+(.+)$/i,
    build: (m) => ({ kind: 'find_agent', query: m[3].trim() }),
    trace: (m) => `find agent "${m[3].trim()}"`,
    help:  '`find agent <texto>` — busca por business_name, agent_name, email o id',
  },
  {
    name:  'health',
    regex: new RegExp(`^\\s*(health|salud)\\s+(${EMAIL_RE.source})\\s*$`, 'i'),
    build: (m) => ({ kind: 'health', portalEmail: m[2].toLowerCase() }),
    trace: (m) => `health ${m[2].toLowerCase()}`,
    help:  '`health <email>` — estado completo de un portal',
  },
  {
    name:  'reset ops',
    regex: new RegExp(`^\\s*reset\\s+ops\\s+(${EMAIL_RE.source})\\s*$`, 'i'),
    build: (m) => ({ kind: 'reset_ops', portalEmail: m[1].toLowerCase() }),
    trace: (m) => `reset ops ${m[1].toLowerCase()}`,
    help:  '`reset ops <email>` — pone ai_ops_used = 0 en los agentes del portal',
  },
  {
    name:  'grant ops',
    regex: new RegExp(`^\\s*grant\\s+(\\d+)\\s+ops\\s+(${EMAIL_RE.source})\\s*$`, 'i'),
    build: (m) => ({ kind: 'grant_ops', portalEmail: m[2].toLowerCase(), count: parseInt(m[1], 10) }),
    trace: (m) => `grant ${m[1]} ops ${m[2].toLowerCase()}`,
    help:  '`grant <N> ops <email>` — agrega N ops (N ≤ 50 sin gate; mayores requieren approval)',
  },
  {
    name:  'reset minutes',
    regex: new RegExp(`^\\s*reset\\s+min(utes|utos)?\\s+(${EMAIL_RE.source})\\s*$`, 'i'),
    build: (m) => ({ kind: 'reset_minutes', portalEmail: m[2].toLowerCase() }),
    trace: (m) => `reset minutes ${m[2].toLowerCase()}`,
    help:  '`reset minutes <email>` — pone minutes_used = 0 (voz)',
  },
];

export function parseCommand(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Comando vacío.' };

  for (const spec of SPECS) {
    const m = input.match(spec.regex);
    if (m) return { ok: true, command: spec.build(m), trace: spec.trace(m) };
  }

  // Sugerencia por keyword aproximado
  const first = input.split(/\s+/)[0]?.toLowerCase() ?? '';
  const suggestion = SPECS.find(s => s.name.startsWith(first))?.help;

  return {
    ok:    false,
    error: 'No es un comando reconocido. Escribe `help` para ver la lista.',
    suggestion,
  };
}

export function helpText(): string {
  return SPECS.map(s => s.help).join('\n');
}
