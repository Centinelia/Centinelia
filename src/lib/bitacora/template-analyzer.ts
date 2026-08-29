import Anthropic from '@anthropic-ai/sdk';
import { Workbook } from 'exceljs';

/**
 * Campos canónicos del IncidentRow que Claude puede mapear a columnas del
 * template del cliente. Si el cliente rastrea otros campos (ej. "peso del
 * pedido"), quedan sin mapear — Nelia no captura eso y esas cols quedan vacías
 * en cada fila apendeada (llenadas por el humano después si aplica).
 */
export const CANONICAL_FIELDS = [
  'fecha',
  'business_name',
  'sucursal',
  'contact_name',
  'contact_phone',
  'address',
  'motivo',
  'tipo',                // queja / alta
  'verification_date',
  'verification_result', // ok / no_visitado / sin_respuesta / pendiente
  'vendedor',
] as const;
export type CanonicalField = typeof CANONICAL_FIELDS[number];

export interface TemplateMapping {
  /** Mapping de letra de columna (A, B, C…) a campo canónico. Cols no
   *  mapeadas quedan vacías al llenar. */
  columns: Partial<Record<string, CanonicalField>>;
  /** Fila 1-indexed donde arrancan los datos (row de referencia para
   *  clonar estilos y desde donde apendear filas nuevas). */
  insertion_row: number;
  /** Nombre del sheet que contiene la bitácora (si hay varios, Claude elige). */
  sheet_name: string;
  /** Comentarios que Claude puso sobre el mapping (ambigüedades detectadas). */
  notes?: string;
}

interface AnalyzeResult {
  mapping: TemplateMapping;
  usage:   { input_tokens: number; output_tokens: number };
}

/**
 * Analiza un xlsx del cliente y devuelve el mapping de columnas a campos
 * canónicos usando Claude Sonnet. El caller es responsable de:
 * 1. Verificar que hay capacidad de pool antes de invocar
 * 2. Cobrar tareas post-success
 * 3. Guardar el mapping en voice_agents.bitacora_template
 */
export async function analyzeTemplate(buffer: Buffer): Promise<AnalyzeResult> {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  // Extraer estructura de cada sheet: nombre + primeras 6 rows.
  const sheetsData = wb.worksheets.map(ws => {
    const rows: Array<Array<string | number | null>> = [];
    for (let r = 1; r <= Math.min(ws.rowCount, 6); r++) {
      const row = ws.getRow(r);
      const cells: Array<string | number | null> = [];
      const maxCol = Math.min(row.cellCount, 26);
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c);
        const v = cell.value;
        if (v == null) cells.push(null);
        else if (typeof v === 'string' || typeof v === 'number') cells.push(v);
        else if (typeof v === 'object' && 'text' in v) cells.push(String((v as { text: unknown }).text ?? ''));
        else cells.push(String(v));
      }
      rows.push(cells);
    }
    return { name: ws.name, rows };
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Eres un analizador de plantillas Excel. El usuario subió una plantilla que usa para llevar la bitácora de incidencias con clientes (quejas, altas de cliente nuevo, seguimiento semanal).

Tu tarea:
1. Identifica cuál sheet contiene la bitácora (si hay varios).
2. Identifica qué columna corresponde a cada uno de estos campos canónicos:
${CANONICAL_FIELDS.map(f => `   - ${f}`).join('\n')}
3. Identifica en qué número de fila arrancan los DATOS (la primera fila donde iría un registro real, después de los headers/títulos).

Campos:
- fecha: fecha de la incidencia
- business_name: nombre del negocio del cliente
- sucursal: sucursal (Apodaca, San Nicolás, etc), opcional
- contact_name: persona que habló
- contact_phone: teléfono
- address: dirección
- motivo: descripción de la queja o notas del cliente
- tipo: queja o alta
- verification_date: fecha de la llamada de verificación (3 días después)
- verification_result: ok / no_visitado / sin_respuesta / pendiente
- vendedor: quién atiende ese cliente

Regla: solo mapea columnas cuya semántica sea CLARA. Si dudas, no la mapeas (mejor faltante que erróneo). Las columnas sin mapear se quedarán vacías (para llenar manual).

Estructura del archivo (primeras 6 filas de cada sheet):
${JSON.stringify(sheetsData, null, 2)}

Responde SOLO con JSON válido en este shape (nada más, sin markdown):
{
  "sheet_name": "nombre exacto del sheet",
  "insertion_row": 3,
  "columns": {
    "A": "fecha",
    "B": "business_name",
    "C": "sucursal"
  },
  "notes": "opcional, si detectaste ambigüedad"
}`;

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude no devolvió JSON parseable');
  const parsed = JSON.parse(jsonMatch[0]) as {
    sheet_name?:    string;
    insertion_row?: number;
    columns?:       Record<string, string>;
    notes?:         string;
  };

  if (!parsed.sheet_name || !parsed.insertion_row || !parsed.columns) {
    throw new Error('Mapping devuelto por Claude está incompleto');
  }

  // Filtrar columnas a solo campos canónicos válidos
  const validColumns: Partial<Record<string, CanonicalField>> = {};
  for (const [col, field] of Object.entries(parsed.columns)) {
    if ((CANONICAL_FIELDS as readonly string[]).includes(field)) {
      validColumns[col.toUpperCase()] = field as CanonicalField;
    }
  }

  return {
    mapping: {
      columns:       validColumns,
      insertion_row: parsed.insertion_row,
      sheet_name:    parsed.sheet_name,
      notes:         parsed.notes,
    },
    usage: {
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
