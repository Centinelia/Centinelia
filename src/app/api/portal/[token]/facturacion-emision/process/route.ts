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
import { buildVisionContextFromAdapter } from '@/lib/billing/vision/build-context';
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
  // cantidad nullable desde v2 del vision: el LLM puede reportar null si la
  // columna CANT manuscrita está vacía o ilegible. Filtramos abajo antes de
  // armar el invoice para no facturar líneas sin cantidad.
  extracted: { nombre: string; cantidad: number | null; unidad: string | null; precio_unitario: number | null };
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

  // 1. Extract note. Pasa VisionContext con catálogo real del cliente para
  // que el LLM coteje nombres manuscritos y valide sum(qty×precio)≈total.
  // Sin esto, el modelo adivinaba y podía facturar al cliente equivocado
  // o por monto equivocado — riesgo fiscal directo.
  let extracted;
  try {
    const supabase = createAdminClient();
    const visionCtx = await buildVisionContextFromAdapter({
      adapter,
      supabase,
      integrationId: integration.id,
      emisor: integration.config.fiscal
        ? { rfc: integration.config.fiscal.rfc_emisor }
        : undefined,
    });
    // Cobrar al pool: resolver Nala del cliente para atribuir el costo del
    // vision LLM. Sin agentId, extract corre pero no cobra (degradación).
    const { data: nalaAgent } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_email', resolved.portalEmail)
      .ilike('agent_name', '%nala%')
      .eq('active', true)
      .maybeSingle();
    const visionBilling = nalaAgent?.id
      ? {
          agentId:     nalaAgent.id as string,
          referenceId: `portal-facturacion-${Date.now()}`,
          labelPrefix: 'Leer notita subida por portal',
        }
      : undefined;
    extracted = await extractNoteFromImage(imageBuffer, mimeType, visionCtx, visionBilling);
  } catch (err) {
    return NextResponse.json(
      { error: `Vision extraction failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  // 2. Match client. CRITICAL: preferimos el `cliente_matched_rfc` que el LLM
  // resolvió CON contexto del catálogo (ya validó fuzzy + reglas de negocio)
  // sobre el fuzzy top-1 de searchClient (que puede tomar falsos positivos
  // con score 0.31). Este bug se encontró en la auditoría 2026-09-04.
  let clientCandidates: BillingClientMatch[] = [];
  let clientChosen: BillingClientMatch | null = null;

  if (extracted.cliente_matched_rfc) {
    // El LLM ya matcheó. Validamos que el RFC realmente exista en catálogo
    // (defensa contra alucinación) y lo usamos si sí.
    const validated = await adapter.getClientByRFC(extracted.cliente_matched_rfc);
    if (validated) {
      clientChosen = { ...validated, score: extracted.confianza.cliente };
      clientCandidates = [clientChosen];
    }
  }

  if (!clientChosen && extracted.cliente_texto) {
    // Fallback: fuzzy search del texto crudo. Requiere score alto para auto-emitir.
    clientCandidates = await adapter.searchClient(extracted.cliente_texto, 5);
    const top = clientCandidates[0] ?? null;
    // Solo aceptar si el score fuzzy es lo suficientemente alto Y no hay
    // ambigüedad con el segundo candidato. Sin esto, un score 0.31 se
    // aceptaba como match y facturaba al cliente equivocado.
    const secondScore = clientCandidates[1]?.score ?? 0;
    if (top && top.score >= 0.85 && (top.score - secondScore) >= 0.1) {
      clientChosen = top;
    }
  }

  // 3. Match each product. Preferir sku_matched del LLM si existe.
  const products: MatchedProduct[] = [];
  for (const p of extracted.productos) {
    let chosen: BillingProductMatch | null = null;
    let candidates: BillingProductMatch[] = [];

    if (p.sku_matched) {
      const bySku = await adapter.getProductBySKU(p.sku_matched);
      if (bySku) {
        chosen = { ...bySku, score: 1.0 };
        candidates = [chosen];
      }
    }
    if (!chosen) {
      candidates = await adapter.searchProduct(p.nombre, 3);
      chosen = candidates[0] ?? null;
    }
    products.push({ extracted: p, candidates, chosen });
  }

  // 4. Build invoice preview (only if we have client + at least one product chosen)
  let xml: string | null = null;
  let savedPath: string | null = null;
  let invoice: BillingInvoice | null = null;
  let aritmeticaOk = true;
  let aritmeticaMensaje: string | null = null;

  // Solo armamos invoice si TODOS los productos matchearon, TODOS tienen
  // cantidad conocida (>0), Y la aritmética cuadra con el monto_total escrito.
  const allProductsMatched =
    products.length > 0 &&
    products.every((p) => p.chosen !== null && (p.extracted.cantidad ?? 0) > 0);

  // CRITICAL: validar sum(qty × precio) ≈ monto_total ANTES de emitir. Sin
  // esto se podía facturar por monto distinto al que el cliente firmó en
  // la nota (bug detectado en la auditoría 2026-09-04). Confiar en el
  // `aritmetica_delta` del LLM no basta: puede alucinar 0.
  if (clientChosen && allProductsMatched && extracted.monto_total !== null) {
    const subtotalCalc = products
      .filter((p) => p.chosen !== null && p.extracted.cantidad !== null && p.extracted.cantidad > 0)
      .reduce((s, p) => s + (p.extracted.cantidad as number) * p.chosen!.precio, 0);
    // Aceptamos delta hasta $2 (redondeo) o exactamente 16% (IVA sumado).
    const delta = subtotalCalc - extracted.monto_total;
    const isRounding = Math.abs(delta) <= 2;
    const isIvaSum = Math.abs(subtotalCalc * 1.16 - extracted.monto_total) <= 2;
    if (!isRounding && !isIvaSum) {
      aritmeticaOk = false;
      aritmeticaMensaje =
        `Los productos suman $${subtotalCalc.toFixed(2)} pero la nota dice $${extracted.monto_total.toFixed(2)} ` +
        `(delta $${delta.toFixed(2)}). Revisa cantidades antes de emitir.`;
    }
  }

  if (clientChosen && allProductsMatched && aritmeticaOk) {
    const lines: BillingLineItem[] = products
      .filter(
        (p): p is MatchedProduct & { chosen: BillingProductMatch; extracted: { cantidad: number } } =>
          p.chosen !== null && p.extracted.cantidad !== null && p.extracted.cantidad > 0,
      )
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
    // Exponer resultado de reconciliación aritmética al UI. Si false, el UI
    // debe mostrar el warning y forzar confirmación humana antes de reintentar.
    aritmeticaOk,
    aritmeticaMensaje,
  });
}
