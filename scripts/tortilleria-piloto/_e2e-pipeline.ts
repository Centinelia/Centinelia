/**
 * Dev-only E2E: corre el pipeline completo foto → XML CONTPAQi contra las
 * fixtures locales de la tortillería piloto, sin pasar por HTTP ni por la UI.
 *
 * Uso:
 *   npx tsx scripts/tortilleria-piloto/_e2e-pipeline.ts <ruta-a-foto>
 *
 * Ejemplo:
 *   npx tsx scripts/tortilleria-piloto/_e2e-pipeline.ts "C:/Users/Nazre/Dropbox/PC/Downloads/WhatsApp Unknown 2026-08-25 at 3.19.40 PM/WhatsApp Image 2026-08-25 at 3.17.11 PM.jpeg"
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { extractNoteFromImage } from '@/lib/billing/vision/extract';
import { buildAdapter } from '@/lib/billing/adapters';
import type {
  BillingInvoice,
  BillingLineItem,
  PaymentMethod,
} from '@/lib/billing/adapter';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: tsx _e2e-pipeline.ts <ruta-a-foto>');
  process.exit(1);
}
const photoPath = args[0];

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  const buffer = readFileSync(photoPath);
  const mime = MIME_BY_EXT[extname(photoPath).toLowerCase()] ?? 'image/jpeg';
  console.log(`[e2e] Loaded ${buffer.length} bytes (${mime}) from ${photoPath}`);

  const adapter = buildAdapter({
    type: 'contpaqi',
    storage_backend: 'local_files',
    local_base_path: join(process.cwd(), 'dev-fixtures', 'tortilleria-piloto'),
    fiscal: {
      rfc_emisor: 'PIL010101AB1',
      regimen_fiscal: '612',
      serie_default: 'FTEN',
      uso_cfdi_default: 'G03',
      clave_sat_default_producto: '50161509',
      codigo_postal_emisor: '67129',
    },
    scheduled_task: {
      expected_sync_interval_minutes: 60,
      stale_warning_minutes: 120,
      stale_escalation_hours: 24,
    },
  });

  console.log('[e2e] Calling Vision AI...');
  const extracted = await extractNoteFromImage(buffer, mime);
  console.log('[e2e] Extracted:', JSON.stringify(extracted, null, 2));

  const clientCandidates = extracted.cliente_texto
    ? await adapter.searchClient(extracted.cliente_texto, 5)
    : [];
  const clientChosen = clientCandidates[0] ?? null;
  console.log(`[e2e] Client top: ${clientChosen?.razonSocial ?? 'NONE'} (${clientChosen?.rfc ?? '-'}, score ${clientChosen?.score ?? '-'})`);
  if (clientCandidates.length > 1) {
    console.log(`[e2e] Other client candidates: ${clientCandidates.slice(1).map((c) => `${c.razonSocial} (${c.rfc}, ${c.score.toFixed(2)})`).join(', ')}`);
  }

  const productRows: {
    extracted: (typeof extracted.productos)[number];
    chosen: { sku: string; nombre: string; precio: number; unidad: string; ivaTasa: number; score: number } | null;
  }[] = [];
  for (const p of extracted.productos) {
    const matches = await adapter.searchProduct(p.nombre, 3);
    const chosen = matches[0] ?? null;
    productRows.push({ extracted: p, chosen });
    console.log(`[e2e] Product "${p.nombre}" x${p.cantidad}${p.unidad ? ' ' + p.unidad : ''} → ${chosen?.sku ?? 'NONE'} ${chosen?.nombre ?? ''} (score ${chosen?.score?.toFixed(2) ?? '-'})`);
  }

  const allMatched = productRows.every((r) => r.chosen !== null);
  if (!clientChosen || !allMatched) {
    console.log('[e2e] SKIP invoice generation: missing client or unmatched products.');
    return;
  }

  const lines: BillingLineItem[] = productRows
    .filter((r): r is { extracted: (typeof extracted.productos)[number]; chosen: NonNullable<typeof r.chosen> } => r.chosen !== null)
    .map((r) => ({
      sku: r.chosen.sku,
      qty: r.extracted.cantidad,
      unitPrice: r.chosen.precio,
      ivaTasa: r.chosen.ivaTasa,
    }));

  const invoice: BillingInvoice = {
    clientRFC: clientChosen.rfc,
    date: extracted.fecha ?? new Date().toISOString().slice(0, 10),
    lines,
    paymentMethod: (extracted.metodo_pago as PaymentMethod | null) ?? 'efectivo',
    usoCFDI: clientChosen.usoCFDI,
    serie: 'FTEN',
  };

  const result = await adapter.submitInvoiceBatch([invoice]);
  console.log('[e2e] Batch result:', result);
  console.log(`[e2e] XML guardado en dev-fixtures/tortilleria-piloto${result.ref}`);
}

main().catch((e) => {
  console.error('[e2e] FAILED', e);
  process.exit(1);
});
