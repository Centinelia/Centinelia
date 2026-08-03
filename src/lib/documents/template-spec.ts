/**
 * Placeholder specifications for user-uploaded .docx templates.
 *
 * Uses docxtemplater with double-brace delimiters {{campo}} to avoid
 * conflicts with regular curly-brace text in Word documents.
 *
 * For dynamic tables (items), users wrap a template row like:
 *   {{#items}} {{descripcion}} | {{cantidad}} | {{precio_unitario}} | {{importe}} {{/items}}
 */

export interface PlaceholderSpec {
  key:         string;   // exact string user must type inside {{ }}
  label:       string;   // human-readable label for UI
  example:     string;   // sample value shown in UI
  required:    boolean;  // whether the doc is unusable without it
  isLoop?:     boolean;  // if true, it's a section like {{#items}}...{{/items}}
  loopFields?: PlaceholderSpec[]; // sub-placeholders available inside a loop
}

const EMISOR_FIELDS: PlaceholderSpec[] = [
  { key: 'emisor_nombre',    label: 'Nombre del emisor',    example: 'Pneuma Studio',                       required: false },
  { key: 'emisor_rfc',       label: 'RFC del emisor',       example: 'AAP010601S21',                        required: false },
  { key: 'emisor_direccion', label: 'Dirección del emisor', example: 'Av. Ejemplo 123, Monterrey NL',       required: false },
  { key: 'emisor_telefono',  label: 'Teléfono del emisor',  example: '+52 811 280 3360',                    required: false },
  { key: 'emisor_email',     label: 'Correo del emisor',    example: 'facturacion@pneumastudio.mx',         required: false },
];

const FACTURA_ITEM_FIELDS: PlaceholderSpec[] = [
  { key: 'descripcion',     label: 'Descripción',    example: 'Servicio de consultoría', required: true },
  { key: 'cantidad',        label: 'Cantidad',       example: '3',                       required: true },
  { key: 'precio_unitario', label: 'Precio unitario', example: '$1,000.00',              required: true },
  { key: 'importe',         label: 'Importe (cantidad × precio)', example: '$3,000.00', required: true },
];

const ORDEN_ITEM_FIELDS: PlaceholderSpec[] = [
  { key: 'descripcion',     label: 'Descripción',    example: 'Papel bond 500 hojas',    required: true },
  { key: 'cantidad',        label: 'Cantidad',       example: '10',                      required: true },
  { key: 'unidad',          label: 'Unidad',         example: 'paquete',                 required: false },
  { key: 'precio_unitario', label: 'Precio unitario', example: '$120.00',                required: true },
  { key: 'importe',         label: 'Importe',        example: '$1,200.00',               required: true },
];

export const FACTURA_PLACEHOLDERS: PlaceholderSpec[] = [
  { key: 'folio',            label: 'Folio de la factura',      example: 'A-20260803-1234',     required: true  },
  { key: 'fecha',            label: 'Fecha de emisión',         example: '3 de agosto de 2026', required: true  },
  { key: 'cliente_nombre',   label: 'Nombre del cliente',       example: 'Juan Pérez',          required: true  },
  { key: 'cliente_rfc',      label: 'RFC del cliente',          example: 'PEJU850312ABC',       required: false },
  { key: 'cliente_email',    label: 'Correo del cliente',       example: 'juan.perez@correo.mx', required: false },
  { key: 'items',            label: 'Tabla de partidas (loop)', example: '{{#items}}...{{/items}}', required: true, isLoop: true, loopFields: FACTURA_ITEM_FIELDS },
  { key: 'subtotal',         label: 'Subtotal',                 example: '$3,000.00',           required: true  },
  { key: 'iva',              label: 'IVA (0 si no aplica)',     example: '$480.00',             required: false },
  { key: 'total',            label: 'Total',                    example: '$3,480.00',           required: true  },
  { key: 'condiciones_pago', label: 'Condiciones de pago',      example: 'Crédito 30 días',     required: false },
  { key: 'notas',            label: 'Notas adicionales',        example: 'Gracias por su preferencia', required: false },
  ...EMISOR_FIELDS,
];

export const ORDEN_PLACEHOLDERS: PlaceholderSpec[] = [
  { key: 'folio',              label: 'Folio de la orden',        example: 'P.O-20260803-5678',  required: true  },
  { key: 'fecha',              label: 'Fecha de emisión',         example: '3 de agosto de 2026', required: true },
  { key: 'proveedor_nombre',   label: 'Nombre del proveedor',     example: 'Suministros SA',      required: true  },
  { key: 'proveedor_rfc',      label: 'RFC del proveedor',        example: 'SIN000101XX0',       required: false },
  { key: 'proveedor_email',    label: 'Correo del proveedor',     example: 'ventas@suministros.mx', required: false },
  { key: 'items',              label: 'Tabla de partidas (loop)', example: '{{#items}}...{{/items}}', required: true, isLoop: true, loopFields: ORDEN_ITEM_FIELDS },
  { key: 'subtotal',           label: 'Subtotal',                 example: '$1,200.00',           required: true  },
  { key: 'iva',                label: 'IVA (0 si no aplica)',     example: '$192.00',             required: false },
  { key: 'total',              label: 'Total',                    example: '$1,392.00',           required: true  },
  { key: 'condiciones_pago',   label: 'Condiciones de pago',      example: 'Pago a 30 días',      required: false },
  { key: 'terminos_entrega',   label: 'Términos de entrega',      example: 'Entrega en 5 días hábiles', required: false },
  { key: 'notas',              label: 'Notas adicionales',        example: 'Enviar a bodega principal', required: false },
  ...EMISOR_FIELDS,
];

const SALES_ITEM_FIELDS: PlaceholderSpec[] = [
  { key: 'descripcion',     label: 'Descripción',    example: 'Servicio de instalación A/C', required: true },
  { key: 'cantidad',        label: 'Cantidad',       example: '2',                       required: true },
  { key: 'precio_unitario', label: 'Precio unitario', example: '$3,200.00',              required: true },
  { key: 'importe',         label: 'Importe (cantidad × precio)', example: '$6,400.00', required: true },
];

export const COTIZACION_PLACEHOLDERS: PlaceholderSpec[] = [
  { key: 'folio',            label: 'Folio de la cotización',   example: 'COT-20260803-1234',   required: true  },
  { key: 'fecha',            label: 'Fecha de emisión',         example: '3 de agosto de 2026', required: true  },
  { key: 'vigencia_dias',    label: 'Días de vigencia',         example: '15',                  required: false },
  { key: 'cliente_nombre',   label: 'Nombre del cliente',       example: 'Ferretería La Central', required: true },
  { key: 'cliente_email',    label: 'Correo del cliente',       example: 'compras@lacentral.mx', required: false },
  { key: 'cliente_direccion',label: 'Dirección del cliente',    example: 'Av. Constitución 123, Monterrey', required: false },
  { key: 'items',            label: 'Tabla de partidas (loop)', example: '{{#items}}...{{/items}}', required: true, isLoop: true, loopFields: SALES_ITEM_FIELDS },
  { key: 'subtotal',         label: 'Subtotal',                 example: '$6,400.00',           required: true  },
  { key: 'iva',              label: 'IVA (0 si no aplica)',     example: '$1,024.00',           required: false },
  { key: 'total',            label: 'Total',                    example: '$7,424.00',           required: true  },
  { key: 'condiciones_pago', label: 'Condiciones de pago',      example: '50% anticipo, 50% al entregar', required: false },
  { key: 'notas',            label: 'Notas adicionales',        example: 'Precios sujetos a cambio sin previo aviso', required: false },
  ...EMISOR_FIELDS,
];

export const NOTA_VENTA_PLACEHOLDERS: PlaceholderSpec[] = [
  { key: 'folio',            label: 'Folio de la nota',         example: 'NV-20260803-5678',    required: true  },
  { key: 'fecha',            label: 'Fecha de venta',           example: '3 de agosto de 2026', required: true  },
  { key: 'cliente_nombre',   label: 'Nombre del cliente',       example: 'Juan Pérez',          required: true  },
  { key: 'cliente_email',    label: 'Correo del cliente',       example: 'juan@correo.mx',      required: false },
  { key: 'items',            label: 'Tabla de partidas (loop)', example: '{{#items}}...{{/items}}', required: true, isLoop: true, loopFields: SALES_ITEM_FIELDS },
  { key: 'subtotal',         label: 'Subtotal',                 example: '$500.00',             required: true  },
  { key: 'iva',              label: 'IVA (0 si no aplica)',     example: '$80.00',              required: false },
  { key: 'total',            label: 'Total',                    example: '$580.00',             required: true  },
  { key: 'forma_pago',       label: 'Forma de pago',            example: 'Efectivo',            required: false },
  { key: 'notas',            label: 'Aviso legal',              example: 'Este documento no es una factura fiscal. Solicite su CFDI a facturacion@empresa.mx', required: false },
  ...EMISOR_FIELDS,
];

export const TEMPLATE_SPECS: Record<string, { label: string; placeholders: PlaceholderSpec[] }> = {
  factura:    { label: 'Factura',         placeholders: FACTURA_PLACEHOLDERS    },
  orden:      { label: 'Orden de compra', placeholders: ORDEN_PLACEHOLDERS      },
  cotizacion: { label: 'Cotización',      placeholders: COTIZACION_PLACEHOLDERS },
  nota_venta: { label: 'Nota de venta',   placeholders: NOTA_VENTA_PLACEHOLDERS },
};

/** Extract placeholder keys the user actually used in a .docx template. */
export function scanPlaceholders(docxText: string): { simple: string[]; loops: string[] } {
  const simple = new Set<string>();
  const loops  = new Set<string>();
  // Match {{key}} and {{#key}} — ignore closing {{/key}}
  const re = /\{\{\s*(#?)([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(docxText)) !== null) {
    if (m[1] === '#') loops.add(m[2]);
    else              simple.add(m[2]);
  }
  return { simple: Array.from(simple), loops: Array.from(loops) };
}
