import { Client } from '@notionhq/client';

export function notionClient(accessToken: string) {
  return new Client({ auth: accessToken });
}

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Lead',
  appointment_booked: 'Cita agendada',
  order_taken:        'Pedido',
  info_provided:      'Información',
  transferred:        'Transferida',
  other:              'Sin resultado',
  unanswered:         'Sin resultado',
};

export async function createCrmDatabase(
  accessToken: string,
  parentPageId: string,
  businessName: string,
): Promise<string> {
  const notion = notionClient(accessToken);
  const db = await (notion.databases.create as any)({
    parent: { type: 'page_id', page_id: parentPageId },
    title:  [{ type: 'text', text: { content: `${businessName} — CRM` } }],
    properties: {
      'Nombre':           { title: {} },
      'Tipo':             { select: { options: [
        { name: 'Llamada', color: 'purple' },
        { name: 'Lead',    color: 'green'  },
        { name: 'Cita',    color: 'blue'   },
        { name: 'Pedido',  color: 'orange' },
      ]}},
      'Fecha':            { date: {} },
      'Teléfono':         { phone_number: {} },
      'Servicio':         { rich_text: {} },
      'Resumen':          { rich_text: {} },
      'Resultado':        { select: { options: [
        { name: 'Lead',          color: 'green'  },
        { name: 'Cita agendada', color: 'blue'   },
        { name: 'Pedido',        color: 'orange' },
        { name: 'Información',   color: 'gray'   },
        { name: 'Transferida',   color: 'yellow' },
        { name: 'Sin resultado', color: 'red'    },
      ]}},
      'Estado':           { select: { options: [
        { name: 'Nuevo',          color: 'yellow' },
        { name: 'En seguimiento', color: 'blue'   },
        { name: 'Cerrado',        color: 'green'  },
        { name: 'Perdido',        color: 'red'    },
      ]}},
      'Acción pendiente': { rich_text: {} },
    },
  });
  return db.id;
}

export async function addCallEntry(opts: {
  accessToken: string;
  dbId:        string;
  nombre:      string | null;
  tipo:        string;
  fecha:       string;
  telefono:    string | null;
  servicio:    string | null;
  resumen:     string | null;
  outcome:     string;
  accion:      string | null;
}): Promise<void> {
  const { accessToken, dbId, nombre, tipo, fecha, telefono, servicio, resumen, outcome, accion } = opts;
  const notion = notionClient(accessToken);

  const rt = (s: string | null) =>
    s ? [{ type: 'text' as const, text: { content: s.slice(0, 2000) } }] : [];

  await notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      'Nombre':   { title:        [{ type: 'text', text: { content: (nombre ?? 'Sin nombre').slice(0, 200) } }] },
      'Tipo':     { select:       { name: tipo } },
      'Fecha':    { date:         { start: fecha } },
      ...(telefono ? { 'Teléfono': { phone_number: telefono } } : {}),
      'Servicio': { rich_text:    rt(servicio) },
      'Resumen':  { rich_text:    rt(resumen)  },
      'Resultado':{ select:       { name: OUTCOME_LABELS[outcome] ?? 'Sin resultado' } },
      'Estado':   { select:       { name: 'Nuevo' } },
      'Acción pendiente': { rich_text: rt(accion) },
    },
  });
}

export async function getAccessiblePages(accessToken: string): Promise<{ id: string; title: string }[]> {
  const notion = notionClient(accessToken);
  const { results } = await notion.search({
    filter:   { value: 'page', property: 'object' },
    page_size: 20,
    sort:      { direction: 'descending', timestamp: 'last_edited_time' },
  });

  return results
    .filter((r): r is Extract<typeof r, { object: 'page' }> => r.object === 'page')
    .map(page => {
      const titleProp = (page as any).properties?.title ?? (page as any).properties?.Name;
      const title = titleProp?.title?.[0]?.plain_text ?? 'Página sin título';
      return { id: page.id, title };
    });
}
