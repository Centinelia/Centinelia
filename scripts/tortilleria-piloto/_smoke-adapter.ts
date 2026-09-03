/**
 * Dev-only smoke test: instancia el CONTPAQiAdapter contra local files,
 * corre searchClient/searchProduct/submitInvoiceBatch, imprime resultados.
 */
import { buildAdapter } from '@/lib/billing/adapters';
import { join } from 'node:path';

const BASE = join(process.cwd(), 'dev-fixtures', 'tortilleria-piloto');

async function main() {
  const adapter = buildAdapter({
    type: 'contpaqi',
    storage_backend: 'local_files',
    local_base_path: BASE,
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

  console.log('[smoke] freshness:', await adapter.freshness());

  const clientHits = await adapter.searchClient('carnes alanis', 3);
  console.log('[smoke] searchClient("carnes alanis"):', clientHits);

  const prodHits = await adapter.searchProduct('tortilla maiz estrella', 3);
  console.log('[smoke] searchProduct("tortilla maiz estrella"):', prodHits);

  if (clientHits.length && prodHits.length) {
    const result = await adapter.submitInvoiceBatch([
      {
        clientRFC: clientHits[0].rfc,
        date: new Date().toISOString().slice(0, 10),
        lines: [
          { sku: prodHits[0].sku, qty: 5, unitPrice: prodHits[0].precio, ivaTasa: prodHits[0].ivaTasa },
        ],
        paymentMethod: 'efectivo',
        usoCFDI: clientHits[0].usoCFDI,
        serie: 'FTEN',
      },
    ]);
    console.log('[smoke] submitInvoiceBatch result:', result);
  }
}

main().catch((e) => {
  console.error('[smoke] FAILED', e);
  process.exit(1);
});
