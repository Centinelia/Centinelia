/**
 * Vision AI extractor para cotizaciones de proveedor (PDF o imagen).
 *
 * Consumido por la tool `qb_crear_orden_compra_desde_cotizacion` del pack
 * ciclo_oc_cfdi. Diferente de `src/lib/billing/vision/extract.ts` (ese es para
 * notitas de venta manuscritas del piloto tortillería).
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface CotizacionProveedor {
  nombre:   string;
  rfc:      string | null;
  email:    string | null;
  telefono: string | null;
}

export interface CotizacionItem {
  descripcion:      string;
  cantidad:         number;
  precio_unitario:  number;
}

export interface ExtractedCotizacion {
  proveedor:         CotizacionProveedor;
  items:             CotizacionItem[];
  subtotal:          number | null;
  iva:               number | null;
  total:             number | null;
  fecha_emision:     string | null;   // YYYY-MM-DD si se detecta
  fecha_vencimiento: string | null;
  condiciones_pago:  string | null;
  moneda:            string;          // default MXN si no detectable
  confianza:         {
    proveedor: number;
    items:     number;
    total:     number;
    global:    number;
  };
  notas_raw:         string;
}

const SYSTEM = `Eres un asistente que extrae datos estructurados de cotizaciones de proveedores mexicanos (PDF o imagen). Devuelves SOLO JSON válido, sin markdown ni texto adicional.

Regla: extrae exactamente lo que aparece en el documento. Nunca inventes RFCs, correos, ni precios. Si un dato no aparece o no está claro, devuelve null y ajusta la confianza. Marca confianza 0.5 o menos cuando dudas.

Los items deben ser líneas concretas de producto/servicio con cantidad, descripción y precio unitario (subtotal por línea = cantidad × precio_unitario). Ignora líneas de totales, IVA, descuentos globales — esos van en su campo dedicado.

Formato de salida esperado:
{
  "proveedor": { "nombre": "...", "rfc": null, "email": null, "telefono": null },
  "items": [{ "descripcion": "...", "cantidad": 1, "precio_unitario": 100 }],
  "subtotal": null,
  "iva": null,
  "total": null,
  "fecha_emision": null,
  "fecha_vencimiento": null,
  "condiciones_pago": null,
  "moneda": "MXN",
  "confianza": { "proveedor": 0.9, "items": 0.85, "total": 0.9, "global": 0.85 },
  "notas_raw": "cualquier observación relevante en 1-2 líneas (opcional, puede ser cadena vacía)"
}`;

const USER = `Extrae los datos estructurados de esta cotización de proveedor. Devuelve SOLO el JSON en el formato indicado.`;

export async function extractCotizacionFromFile(
  buffer:   Buffer,
  mimeType: string,
): Promise<ExtractedCotizacion> {
  const model  = process.env.BILLING_VISION_MODEL ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const isImage = mimeType.startsWith('image/');
  const isPdf   = mimeType === 'application/pdf';
  if (!isImage && !isPdf) throw new Error(`MIME type no soportado: ${mimeType}. Usa PDF o imagen.`);

  // Anthropic acepta image o document (PDF native)
  const content: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam = isImage
    ? {
        type:   'image',
        source: {
          type: 'base64',
          media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: buffer.toString('base64'),
        },
      }
    : {
        type:   'document',
        source: {
          type:      'base64',
          media_type: 'application/pdf',
          data:      buffer.toString('base64'),
        },
      };

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system:    SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          content,
          { type: 'text', text: USER },
        ],
      },
    ],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Vision extractor no devolvió JSON parseable.');

  const parsed = JSON.parse(jsonMatch[0]) as ExtractedCotizacion;
  // Sanitize minimums
  parsed.items = (parsed.items ?? []).filter(i =>
    typeof i.descripcion === 'string' && i.descripcion.trim().length > 0 &&
    typeof i.cantidad === 'number' && i.cantidad > 0 &&
    typeof i.precio_unitario === 'number' && i.precio_unitario > 0
  );
  parsed.moneda = parsed.moneda || 'MXN';

  return parsed;
}
