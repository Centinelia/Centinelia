/**
 * Sheets tools — 4 herramientas para leer y escribir en Google Sheets.
 *
 * Cada tool acepta un argumento `purpose` que identifica el Sheet configurado
 * para ese propósito en la org. Si no hay mapeo, devuelve { ok: false, reason:
 * 'sheet_no_configurado' } para que el agente informe al usuario.
 *
 * Usa `portalEmail` del ctx (AgentToolContext) como identificador de la org.
 */
import * as sheetsService from '@/lib/services/sheets';
import type { AgentToolContext } from '@/lib/tools/executor';

type SheetsTool = {
  name:        string;
  description: string;
  capability:  string;
  parameters:  Record<string, unknown>;
  execute:     (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<Record<string, unknown>>;
};

const purposeEnum = ['clientes', 'leads', 'bitacoras', 'oc', 'cajas_chicas', 'custom'] as const;
type Purpose = typeof purposeEnum[number];

async function resolveMapping(
  portalEmail: string,
  purpose: Purpose,
  customLabel?: string,
): Promise<{ mapping: sheetsService.SheetsMapping } | { error: Record<string, unknown> }> {
  try {
    const mapping = await sheetsService.getMapping(portalEmail, purpose, customLabel);
    if (!mapping) return { error: { ok: false, reason: 'sheet_no_configurado', purpose } };
    return { mapping };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { error: { ok: false, reason: 'sheet_no_configurado', purpose, detail } };
  }
}

export const sheetsTools: SheetsTool[] = [
  {
    name:        'sheets_agregar_fila',
    description: 'Agrega una fila al Google Sheet configurado para el propósito indicado: clientes, leads, bitacoras, ordenes de compra, cajas chicas o personalizado.',
    capability:  'sheets.write',
    parameters: {
      type:     'object',
      required: ['purpose', 'data'],
      properties: {
        purpose: {
          type:        'string',
          enum:        [...purposeEnum],
          description: 'Sheet de destino: clientes, leads, bitacoras, oc, cajas_chicas, custom.',
        },
        custom_purpose_label: {
          type:        'string',
          description: 'Etiqueta del Sheet cuando purpose=custom.',
        },
        data: {
          type:                 'object',
          additionalProperties: true,
          description:          'Objeto clave-valor donde cada clave es un encabezado del Sheet.',
        },
      },
    },
    async execute({ purpose, custom_purpose_label, data }, ctx) {
      const r = await resolveMapping(ctx.portalEmail, purpose as Purpose, custom_purpose_label as string | undefined);
      if ('error' in r) return r.error;
      const res = await sheetsService.appendRow(r.mapping.id, data as Record<string, unknown>);
      return res.ok
        ? { ok: true, row_number: res.data.row_number }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
  {
    name:        'sheets_actualizar_fila',
    description: 'Actualiza una fila existente en el Google Sheet configurado, buscando por una columna y valor exacto.',
    capability:  'sheets.write',
    parameters: {
      type:     'object',
      required: ['purpose', 'match_by', 'match_value', 'data'],
      properties: {
        purpose: {
          type:        'string',
          enum:        [...purposeEnum],
          description: 'Sheet de destino: clientes, leads, bitacoras, oc, cajas_chicas, custom.',
        },
        custom_purpose_label: {
          type:        'string',
          description: 'Etiqueta del Sheet cuando purpose=custom.',
        },
        match_by: {
          type:        'string',
          description: 'Nombre de la columna por la que buscar.',
        },
        match_value: {
          type:        'string',
          description: 'Valor a encontrar en esa columna.',
        },
        data: {
          type:                 'object',
          additionalProperties: true,
          description:          'Campos a actualizar en la fila encontrada.',
        },
      },
    },
    async execute({ purpose, custom_purpose_label, match_by, match_value, data }, ctx) {
      const r = await resolveMapping(ctx.portalEmail, purpose as Purpose, custom_purpose_label as string | undefined);
      if ('error' in r) return r.error;
      const res = await sheetsService.updateRow(
        r.mapping.id,
        match_by as string,
        match_value as string,
        data as Record<string, unknown>,
      );
      return res.ok
        ? { ok: true, row_number: res.data.row_number }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
  {
    name:        'sheets_leer',
    description: 'Lee el contenido del Google Sheet configurado para el propósito indicado. Devuelve las filas como objetos.',
    capability:  'sheets.read',
    parameters: {
      type:     'object',
      required: ['purpose'],
      properties: {
        purpose: {
          type:        'string',
          enum:        [...purposeEnum],
          description: 'Sheet a leer: clientes, leads, bitacoras, oc, cajas_chicas, custom.',
        },
        custom_purpose_label: {
          type:        'string',
          description: 'Etiqueta del Sheet cuando purpose=custom.',
        },
        range: {
          type:        'string',
          description: 'Rango A1 opcional (por ejemplo: A1:D50).',
        },
      },
    },
    async execute({ purpose, custom_purpose_label, range }, ctx) {
      const r = await resolveMapping(ctx.portalEmail, purpose as Purpose, custom_purpose_label as string | undefined);
      if ('error' in r) return r.error;
      const res = await sheetsService.readRange(r.mapping.id, range as string | undefined);
      return res.ok
        ? { ok: true, rows: res.data.rows }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
  {
    name:        'sheets_buscar',
    description: 'Busca filas en el Google Sheet configurado que contengan un texto. La busqueda es insensible a mayusculas.',
    capability:  'sheets.read',
    parameters: {
      type:     'object',
      required: ['purpose', 'query'],
      properties: {
        purpose: {
          type:        'string',
          enum:        [...purposeEnum],
          description: 'Sheet donde buscar: clientes, leads, bitacoras, oc, cajas_chicas, custom.',
        },
        custom_purpose_label: {
          type:        'string',
          description: 'Etiqueta del Sheet cuando purpose=custom.',
        },
        query: {
          type:        'string',
          description: 'Texto a buscar en cualquier celda de la fila.',
        },
      },
    },
    async execute({ purpose, custom_purpose_label, query }, ctx) {
      const r = await resolveMapping(ctx.portalEmail, purpose as Purpose, custom_purpose_label as string | undefined);
      if ('error' in r) return r.error;
      const res = await sheetsService.searchInTab(r.mapping.id, query as string);
      return res.ok
        ? { ok: true, rows: res.data.rows }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
];
