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

/**
 * Días del grid de seguimiento semanal (Lun a Sáb). Domingo se ignora — poco
 * común en tortillerías y negocios similares que usan la bitácora.
 */
export type GridDayKey = 'L' | 'M' | 'MI' | 'J' | 'V' | 'S';

export interface TemplateMapping {
  /** Mapping de letra de columna (A, B, C…) a campo canónico. Cols no
   *  mapeadas quedan vacías al llenar. */
  columns: Partial<Record<string, CanonicalField>>;
  /** Fila 1-indexed donde arrancan los datos (row de referencia para
   *  clonar estilos y desde donde apendear filas nuevas). */
  insertion_row: number;
  /** Nombre del sheet que contiene la bitácora (si hay varios, Claude elige). */
  sheet_name: string;
  /** Letras de columnas que el empleado digital NUNCA actualiza. Se llenan al
   *  crear la fila (initial write) con el valor de DB, y de ahí en adelante
   *  se preservan aunque el humano las edite. Auto-detectado por Claude
   *  (vendedor asignado, notas del gerente, prioridad, seguimiento, etc);
   *  el cliente puede overridear desde el UI. */
  human_only_columns: string[];
  /** Grid semanal L/M/MI/J/V/S de seguimiento post-llamada. Cuando el
   *  incident tiene verification_result === 'ok', el empleado escribe "OK"
   *  en la col del día del verification_called_at. Otros resultados dejan la
   *  celda vacía. Opcional — muchas plantillas no tienen este grid. */
  verification_grid?: Partial<Record<GridDayKey, string>>;
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
4. Identifica cuáles columnas son "solo humano" — cols donde el usuario final escribe manualmente sus notas y NO deben ser sobreescritas por el empleado digital. Patrones típicos: "vendedor asignado", "responsable", "notas del gerente", "prioridad", "seguimiento", "comentarios internos", "estatus interno". La col "vendedor" casi siempre entra aquí (el humano asigna quién atiende).
5. Identifica un grid de seguimiento semanal si existe: 6 columnas contiguas con headers de días L, M, MI (o "Mi"), J, V, S (Lunes a Sábado). También aceptan variantes como "Lun Mar Mie Jue Vie Sab", "L M M J V S", etc. Este grid se usa para marcar "OK" en el día que se confirmó el seguimiento con el cliente. Si detectas este grid, incluye verification_grid con las letras de las cols de cada día. Si no lo detectas, OMITE el campo verification_grid en tu respuesta.

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

Regla mapping: solo mapea columnas cuya semántica sea CLARA. Si dudas, no la mapeas (mejor faltante que erróneo).
Regla human_only: incluye letras de columnas que el empleado digital debe respetar aunque estén mapeadas (initial-write con dato de DB si aplica, después nunca sobrescribir).
Regla grid: el grid es 6 días L-S. Las cols del grid NO se incluyen en columns ni en human_only_columns — van solo en verification_grid.

Estructura del archivo (primeras 6 filas de cada sheet):
${JSON.stringify(sheetsData, null, 2)}

Responde SOLO con JSON válido en este shape (nada más, sin markdown). El campo verification_grid es opcional; inclúyelo solo si detectaste el grid:
{
  "sheet_name": "nombre exacto del sheet",
  "insertion_row": 3,
  "columns": {
    "A": "fecha",
    "B": "business_name",
    "C": "sucursal",
    "D": "vendedor"
  },
  "human_only_columns": ["D"],
  "verification_grid": { "L": "K", "M": "L", "MI": "M", "J": "N", "V": "O", "S": "P" },
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
    sheet_name?:         string;
    insertion_row?:      number;
    columns?:            Record<string, string>;
    human_only_columns?: string[];
    verification_grid?:  Record<string, string>;
    notes?:              string;
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

  // Normalizar human_only_columns: uppercase, dedupe, y solo cols que existen
  // en el mapping (evita marcar cols vacías o inexistentes).
  const humanOnly = Array.isArray(parsed.human_only_columns)
    ? [...new Set(parsed.human_only_columns.map(c => String(c).toUpperCase()))]
        .filter(c => c in validColumns)
    : [];

  // Normalizar verification_grid: solo keys válidos L/M/MI/J/V/S, cols uppercase.
  // Requiere que al menos 3 días estén presentes (si no, probablemente Claude
  // se confundió con otra cosa que no es el grid).
  const VALID_GRID_KEYS: Array<'L' | 'M' | 'MI' | 'J' | 'V' | 'S'> = ['L', 'M', 'MI', 'J', 'V', 'S'];
  let verificationGrid: Partial<Record<'L' | 'M' | 'MI' | 'J' | 'V' | 'S', string>> | undefined;
  if (parsed.verification_grid && typeof parsed.verification_grid === 'object') {
    const cleaned: Partial<Record<'L' | 'M' | 'MI' | 'J' | 'V' | 'S', string>> = {};
    let count = 0;
    for (const key of VALID_GRID_KEYS) {
      const raw = parsed.verification_grid[key];
      if (typeof raw === 'string' && /^[A-Z]{1,3}$/i.test(raw)) {
        cleaned[key] = raw.toUpperCase();
        count++;
      }
    }
    if (count >= 3) verificationGrid = cleaned;
  }

  return {
    mapping: {
      columns:            validColumns,
      insertion_row:      parsed.insertion_row,
      sheet_name:         parsed.sheet_name,
      human_only_columns: humanOnly,
      verification_grid:  verificationGrid,
      notes:              parsed.notes,
    },
    usage: {
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
