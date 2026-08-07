import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { queryDatabaseRows } from '@/lib/notion/client';
import { getSheetsClient } from '@/lib/connectors/sheets-client';

interface Params { params: Promise<{ token: string }> }

type ImportProvider = 'notion' | 'sheets';

interface ImportBody {
  provider:  ImportProvider;
  source_id: string;
  agent_id:  string;
  mapping:   {
    phone:   string;
    name?:   string;
    email?:  string;
    tags?:   string;
    motivo?: string;
  };
  /** true = solo preview (no insert), muestra qué se importaría */
  dry_run?: boolean;
}

interface ImportRow {
  external_id: string;
  nombre?:     string;
  telefono:    string;
  email?:      string;
  motivo?:     string;
  tags?:       string[];
}

/**
 * POST /api/portal/[token]/contacts/import
 *
 * Importa contactos desde Notion o Sheets a outbound_contacts.
 * Dedupe por (agent_id, external_source, external_id): re-imports actualizan
 * en vez de duplicar (idempotente).
 *
 * Body: { provider, source_id, agent_id, mapping: {phone, name?, email?, tags?, motivo?}, dry_run? }
 * Retorna: { total, inserted, updated, skipped, sample } — sample siempre
 * (los primeros 5 rows para preview inline en el modal).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as ImportBody;
  const { provider, source_id, agent_id, mapping, dry_run } = body;

  if (!access.ids.includes(agent_id)) {
    return NextResponse.json({ error: 'Empleado no válido para este portal.' }, { status: 403 });
  }
  if (!mapping?.phone?.trim()) {
    return NextResponse.json({ error: 'Mapea la columna de teléfono.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  let rows: ImportRow[] = [];

  if (provider === 'notion') {
    const { data: agentNotion } = await supabase
      .from('voice_agents')
      .select('notion_access_token')
      .eq('portal_email', access.portalEmail)
      .not('notion_access_token', 'is', null)
      .limit(1).maybeSingle();
    const notionToken = agentNotion?.notion_access_token as string | null;
    if (!notionToken) {
      return NextResponse.json({ error: 'Notion no está conectado.' }, { status: 400 });
    }
    try {
      const notionRows = await queryDatabaseRows(notionToken, source_id, 500);
      rows = notionRows
        .map(r => rowFromMapping(r.id, r.properties, mapping))
        .filter((r): r is ImportRow => !!r);
    } catch (err) {
      return NextResponse.json({ error: `Notion: ${(err as Error).message}` }, { status: 500 });
    }
  } else if (provider === 'sheets') {
    const { data: mappingRow } = await supabase
      .from('sheets_mappings')
      .select('spreadsheet_id, tab_name, headers')
      .eq('id', source_id)
      .eq('portal_email', access.portalEmail)
      .single();
    if (!mappingRow) {
      return NextResponse.json({ error: 'Sheet mapping no encontrado.' }, { status: 404 });
    }
    try {
      const sheets = await getSheetsClient(access.portalEmail);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: mappingRow.spreadsheet_id as string,
        range:         `${mappingRow.tab_name}!A2:ZZ1000`,
      });
      const headers = (mappingRow.headers as string[]) ?? [];
      const values  = (res.data.values ?? []) as string[][];
      rows = values
        .map((rowArr, idx) => {
          const props: Record<string, unknown> = {};
          headers.forEach((h, i) => { props[h] = rowArr[i] ?? null; });
          return rowFromMapping(`sheet:${source_id}:${idx + 2}`, props, mapping);
        })
        .filter((r): r is ImportRow => !!r);
    } catch (err) {
      return NextResponse.json({ error: `Sheets: ${(err as Error).message}` }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Provider no soportado.' }, { status: 400 });
  }

  const total   = rows.length;
  const sample  = rows.slice(0, 5);

  if (dry_run) {
    return NextResponse.json({ total, inserted: 0, updated: 0, skipped: 0, sample });
  }

  // Upsert por (agent_id, external_source, external_id).
  // Insert = nuevo; update = actualiza tags/nombre/email/motivo si cambió.
  let inserted = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    if (!r.telefono?.trim()) { skipped++; continue; }
    const payload = {
      agent_id,
      nombre:          r.nombre?.trim()   || null,
      telefono:        r.telefono.trim(),
      email:           r.email?.trim()    || null,
      motivo:          r.motivo?.trim()   || null,
      source:          provider === 'notion' ? 'notion' : 'sheets',
      external_source: provider,
      external_id:     r.external_id,
      tags:            r.tags ?? [],
    };
    const { data: existing } = await supabase
      .from('outbound_contacts')
      .select('id')
      .eq('agent_id', agent_id)
      .eq('external_source', provider)
      .eq('external_id', r.external_id)
      .maybeSingle();
    if (existing) {
      await supabase.from('outbound_contacts').update(payload).eq('id', existing.id);
      updated++;
    } else {
      const { error } = await supabase.from('outbound_contacts').insert(payload);
      if (error) skipped++; else inserted++;
    }
  }

  return NextResponse.json({ total, inserted, updated, skipped, sample });
}

function rowFromMapping(
  externalId: string,
  props: Record<string, unknown>,
  mapping: ImportBody['mapping'],
): ImportRow | null {
  const asString = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'string') return v.trim() || undefined;
    if (typeof v === 'number') return String(v);
    return undefined;
  };
  const asStringArray = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    return undefined;
  };
  const phone = asString(props[mapping.phone]);
  if (!phone) return null;
  return {
    external_id: externalId,
    telefono:    phone,
    nombre:      mapping.name   ? asString(props[mapping.name])   : undefined,
    email:       mapping.email  ? asString(props[mapping.email])  : undefined,
    motivo:      mapping.motivo ? asString(props[mapping.motivo]) : undefined,
    tags:        mapping.tags   ? asStringArray(props[mapping.tags]) : undefined,
  };
}
