/**
 * POST /api/portal/[token]/facturacion-emision/process
 *
 * Recibe una foto de notita de venta manuscrita, corre el pipeline:
 *   Vision AI → match cliente → match productos → build BillingInvoice
 *   → adapter.submitInvoiceBatch → XML importable en CONTPAQi
 *
 * Devuelve un JSON con la nota extraída, los candidatos de cliente/productos,
 * el XML generado (string) y la ruta relativa donde quedó guardado en el
 * backend de storage (Dropbox o local files).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { extractNoteFromImage } from '@/lib/billing/vision/extract';
import { buildAdapter, type OrganizationIntegrationConfig } from '@/lib/billing/adapters';
import { buildImportXml } from '@/lib/billing/contpaqi/xml-import';
import type {
  BillingInvoice,
  BillingLineItem,
  BillingClientMatch,
  BillingProductMatch,
  PaymentMethod,
} from '@/lib/billing/adapter';

export const dynamic = 'force-dynamic';
// Cap runtime; Vision + adapter calls should finish comfortably under 60s.
export const maxDuration = 60;

interface Params { params: Promise<{ token: string }> }

interface MatchedProduct {
  extracted: { nombre: string; cantidad: number; unidad: string | null };
  candidates: BillingProductMatch[];
  chosen: BillingProductMatch | null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && auth.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image is required' }, { status: 400 });
  }
  const mimeType = file.type || 'image/jpeg';
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
    return NextResponse.json({ error: `unsupported mime type: ${mimeType}` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from('organization_integrations')
    .select('id, config')
    .eq('portal_email', resolved.portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle() as { data: { id: string; config: OrganizationIntegrationConfig } | null };

  if (!integration) {
    return NextResponse.json(
      { error: 'No CONTPAQi integration configured for this org' },
      { status: 400 },
    );
  }

  let adapter;
  try {
    adapter = buildAdapter(integration.config);
  } catch (err) {
    return NextResponse.json(
      { error: `Adapter build failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  const imageBuffer = Buffer.from(await file.arrayBuffer());

  // 1. Extract note
  let extracted;
  try {
    extracted = await extractNoteFromImage(imageBuffer, mimeType);
  } catch (err) {
    return NextResponse.json(
      { error: `Vision extraction failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // 2. Match client
  let clientCandidates: BillingClientMatch[] = [];
  let clientChosen: BillingClientMatch | null = null;
  if (extracted.cliente_texto) {
    clientCandidates = await adapter.searchClient(extracted.cliente_texto, 5);
    clientChosen = clientCandidates[0] ?? null;
  }

  // 3. Match each product
  const products: MatchedProduct[] = [];
  for (const p of extracted.productos) {
    const candidates = await adapter.searchProduct(p.nombre, 3);
    products.push({ extracted: p, candidates, chosen: candidates[0] ?? null });
  }

  // 4. Build invoice preview (only if we have client + at least one product chosen)
  let xml: string | null = null;
  let savedPath: string | null = null;
  let invoice: BillingInvoice | null = null;

  const allProductsMatched = products.length > 0 && products.every((p) => p.chosen !== null);
  if (clientChosen && allProductsMatched) {
    const lines: BillingLineItem[] = products
      .filter((p): p is MatchedProduct & { chosen: BillingProductMatch } => p.chosen !== null)
      .map((p) => ({
        sku: p.chosen.sku,
        qty: p.extracted.cantidad,
        unitPrice: p.chosen.precio,
        ivaTasa: p.chosen.ivaTasa,
      }));

    const paymentMethod: PaymentMethod =
      (extracted.metodo_pago as PaymentMethod | null) ?? 'efectivo';

    invoice = {
      clientRFC: clientChosen.rfc,
      date: extracted.fecha ?? new Date().toISOString().slice(0, 10),
      lines,
      paymentMethod,
      usoCFDI: clientChosen.usoCFDI,
      serie: integration.config.fiscal?.serie_default,
    };

    xml = buildImportXml([invoice], {
      serie: integration.config.fiscal!.serie_default,
      rfcEmisor: integration.config.fiscal!.rfc_emisor,
      regimenFiscal: integration.config.fiscal!.regimen_fiscal,
      lugarExpedicion: integration.config.fiscal!.codigo_postal_emisor,
      usoCFDIDefault: integration.config.fiscal!.uso_cfdi_default,
    });

    // Persist through adapter so it lands in the standard `Importables_CONTPAQi/pendientes/`
    const batchResult = await adapter.submitInvoiceBatch([invoice]);
    savedPath = Array.isArray(batchResult.ref) ? batchResult.ref[0] : batchResult.ref;
  }

  return NextResponse.json({
    extracted,
    clientCandidates,
    clientChosen,
    products,
    invoice,
    xml,
    savedPath,
  });
}
