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

// ── Product catalog ───────────────────────────────────────────────────────────

const DEMO_PRODUCTS = [
  { sku: 'PRD-001', nombre: 'Consultoría Empresarial',    descripcion: 'Sesión de asesoría y diagnóstico de negocio',    precio: 3500,  unidad: 'hr',       categoria: 'Servicio' },
  { sku: 'PRD-002', nombre: 'Diseño de Identidad Visual', descripcion: 'Logo, paleta de colores y tipografía',           precio: 8000,  unidad: 'servicio', categoria: 'Servicio' },
  { sku: 'PRD-003', nombre: 'Desarrollo Web',             descripcion: 'Sitio corporativo de hasta 5 páginas',           precio: 18000, unidad: 'servicio', categoria: 'Servicio' },
  { sku: 'PRD-004', nombre: 'Mantenimiento Web Mensual',  descripcion: 'Soporte, actualizaciones y hosting incluido',    precio: 2500,  unidad: 'mes',      categoria: 'Soporte'  },
  { sku: 'PRD-005', nombre: 'Campaña de Email Marketing', descripcion: 'Diseño, redacción y envío de campaña',           precio: 4500,  unidad: 'campana',  categoria: 'Servicio' },
  { sku: 'PRD-006', nombre: 'Capacitación Empresarial',   descripcion: 'Taller grupal para hasta 10 personas',           precio: 6000,  unidad: 'sesion',   categoria: 'Servicio' },
  { sku: 'PRD-007', nombre: 'Auditoría SEO',              descripcion: 'Análisis y reporte de posicionamiento web',      precio: 5500,  unidad: 'servicio', categoria: 'Servicio' },
  { sku: 'PRD-008', nombre: 'Gestión de Redes Sociales',  descripcion: '2 redes, 12 publicaciones mensuales',            precio: 3200,  unidad: 'mes',      categoria: 'Servicio' },
  { sku: 'PRD-009', nombre: 'Laptop Dell Vostro 15',      descripcion: 'Core i7, 16 GB RAM, 512 GB SSD',                precio: 22500, unidad: 'pza',      categoria: 'Producto' },
  { sku: 'PRD-010', nombre: 'Monitor LG 27" 4K',          descripcion: 'IPS, USB-C, para trabajo profesional',           precio: 6800,  unidad: 'pza',      categoria: 'Producto' },
  { sku: 'PRD-011', nombre: 'Licencia Microsoft 365',     descripcion: 'Suite ofimática, 1 usuario, anual',              precio: 3500,  unidad: 'ano',      categoria: 'Software' },
  { sku: 'PRD-012', nombre: 'Silla Ergonómica',           descripcion: 'Con soporte lumbar y reposabrazos ajustables',   precio: 8900,  unidad: 'pza',      categoria: 'Producto' },
  { sku: 'PRD-013', nombre: 'Headset USB Jabra',          descripcion: 'Con micrófono cancelador de ruido',              precio: 4200,  unidad: 'pza',      categoria: 'Producto' },
  { sku: 'PRD-014', nombre: 'Servidor NAS 4TB',           descripcion: 'Almacenamiento en red empresarial, 4 bahías',    precio: 14500, unidad: 'pza',      categoria: 'Producto' },
  { sku: 'PRD-015', nombre: 'Soporte Técnico Presencial', descripcion: 'Visita técnica con diagnóstico y solución',      precio: 800,   unidad: 'hr',       categoria: 'Soporte'  },
] as const;

export async function createProductDatabase(
  accessToken: string,
  parentPageId: string,
): Promise<string> {
  const notion = notionClient(accessToken);

  // The SDK's databases.create strips the `properties` key (not in bodyParams).
  // Call the REST endpoint directly so Notion receives the full schema.
  const res = await fetch('https://api.notion.com/v1/databases', {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${accessToken}`,
      'Content-Type':   'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title:  [{ type: 'text', text: { content: 'Catálogo de Productos' } }],
      properties: {
        'SKU':         { title: {} },
        'Nombre':      { rich_text: {} },
        'Descripcion': { rich_text: {} },
        'Precio':      { number: { format: 'peso' } },
        'Unidad':      { select: { options: [
          { name: 'pza',      color: 'blue'   },
          { name: 'hr',       color: 'green'  },
          { name: 'mes',      color: 'orange' },
          { name: 'ano',      color: 'purple' },
          { name: 'servicio', color: 'gray'   },
          { name: 'campana',  color: 'yellow' },
          { name: 'sesion',   color: 'pink'   },
        ]}},
        'IVA':         { checkbox: {} },
        'Categoria':   { select: { options: [
          { name: 'Servicio',  color: 'blue'   },
          { name: 'Producto',  color: 'green'  },
          { name: 'Software',  color: 'purple' },
          { name: 'Soporte',   color: 'orange' },
        ]}},
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion databases.create failed ${res.status}: ${body}`);
  }
  const db = await res.json() as { id: string };

  const rt = (s: string) => [{ type: 'text' as const, text: { content: s } }];
  for (const p of DEMO_PRODUCTS) {
    await notion.pages.create({
      parent: { database_id: db.id },
      properties: {
        'SKU':         { title:     rt(p.sku)         },
        'Nombre':      { rich_text: rt(p.nombre)      },
        'Descripcion': { rich_text: rt(p.descripcion) },
        'Precio':      { number:    p.precio          },
        'Unidad':      { select:    { name: p.unidad }},
        'IVA':         { checkbox:  true              },
        'Categoria':   { select:    { name: p.categoria }},
      },
    });
  }

  return db.id as string;
}

export async function searchProduct(
  accessToken: string,
  dbId: string,
  query: string,
): Promise<{ sku: string; nombre: string; descripcion: string; precio: number; unidad: string; iva: boolean } | null> {
  const notion = notionClient(accessToken);

  // Try exact SKU first, then name contains
  const filters = [
    { property: 'SKU',    title:     { equals:   query.toUpperCase() } },
    { property: 'Nombre', rich_text: { contains: query               } },
  ];

  for (const filter of filters) {
    const res = await (notion.databases as any).query({ database_id: dbId, filter, page_size: 1 });
    const page = res.results?.[0];
    if (page) {
      const p = page.properties;
      return {
        sku:         p['SKU']?.title?.[0]?.plain_text             ?? '',
        nombre:      p['Nombre']?.rich_text?.[0]?.plain_text      ?? '',
        descripcion: p['Descripcion']?.rich_text?.[0]?.plain_text ?? '',
        precio:      p['Precio']?.number                          ?? 0,
        unidad:      p['Unidad']?.select?.name                    ?? 'pza',
        iva:         p['IVA']?.checkbox                           ?? true,
      };
    }
  }
  return null;
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

/**
 * Lista las databases a las que la integración tiene acceso. Usado para
 * import de contactos: el usuario elige de qué DB jalar.
 */
export async function getAccessibleDatabases(accessToken: string): Promise<{
  id:         string;
  title:      string;
  properties: Record<string, { type: string; name: string }>;
}[]> {
  const notion = notionClient(accessToken);
  // SDK types don't expose 'database' filter directly (usa page|data_source),
  // pero la API HTTP sí lo acepta. Cast + filter runtime por object='database'.
  const { results } = await (notion.search as any)({
    filter:   { value: 'database', property: 'object' },
    page_size: 50,
    sort:      { direction: 'descending', timestamp: 'last_edited_time' },
  }) as { results: Array<{ object: string; id: string; [k: string]: unknown }> };

  return results
    .filter(r => r.object === 'database')
    .map(db => {
      const title = ((db as any).title as Array<{ plain_text?: string }> | undefined)?.[0]?.plain_text ?? 'Database sin título';
      const props: Record<string, { type: string; name: string }> = {};
      const rawProps = ((db as any).properties as Record<string, { type: string }> | undefined) ?? {};
      for (const [name, def] of Object.entries(rawProps)) {
        props[name] = { type: def.type, name };
      }
      return { id: db.id, title, properties: props };
    });
}

/**
 * Query rows de una database. Retorna hasta N filas con properties normalizadas
 * a { name → primitive }. Usado para preview e import de contactos.
 */
export async function queryDatabaseRows(
  accessToken: string,
  databaseId: string,
  pageSize = 100,
): Promise<{ id: string; properties: Record<string, unknown> }[]> {
  const notion = notionClient(accessToken);
  const rows: { id: string; properties: Record<string, unknown> }[] = [];
  let cursor: string | undefined;

  do {
    const res = await (notion.databases as any).query({
      database_id: databaseId,
      page_size:   Math.min(100, pageSize - rows.length),
      start_cursor: cursor,
    });
    for (const page of res.results ?? []) {
      const props: Record<string, unknown> = {};
      for (const [name, val] of Object.entries((page as any).properties ?? {})) {
        props[name] = extractPropertyValue(val as any);
      }
      rows.push({ id: page.id, properties: props });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor && rows.length < pageSize);

  return rows;
}

function extractPropertyValue(prop: { type: string; [k: string]: unknown }): unknown {
  switch (prop.type) {
    case 'title':        return (prop.title as any[])?.[0]?.plain_text ?? null;
    case 'rich_text':    return (prop.rich_text as any[])?.map(r => r.plain_text).join('') ?? null;
    case 'phone_number': return prop.phone_number ?? null;
    case 'email':        return prop.email ?? null;
    case 'url':          return prop.url ?? null;
    case 'number':       return prop.number ?? null;
    case 'select':       return (prop.select as any)?.name ?? null;
    case 'multi_select': return ((prop.multi_select as any[]) ?? []).map(o => o.name);
    case 'status':       return (prop.status as any)?.name ?? null;
    case 'checkbox':     return !!prop.checkbox;
    case 'date':         return (prop.date as any)?.start ?? null;
    case 'people':       return ((prop.people as any[]) ?? []).map(p => p.name ?? p.id);
    case 'formula':      {
      const f = prop.formula as any;
      return f?.string ?? f?.number ?? f?.boolean ?? f?.date?.start ?? null;
    }
    default: return null;
  }
}
