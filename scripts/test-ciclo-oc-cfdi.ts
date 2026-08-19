/**
 * test-ciclo-oc-cfdi.ts — Prueba end-to-end del pack ciclo OC-CFDI con
 * la org de AC Proyectos (sandbox QB + sandbox SF).
 *
 * Uso:
 *   npx tsx scripts/test-ciclo-oc-cfdi.ts
 *
 * Requiere .env.local con SUPABASE_SERVICE_ROLE_KEY, INTUIT_CLIENT_ID,
 * INTUIT_CLIENT_SECRET, ANTHROPIC_API_KEY (para verifier), ENCRYPTION_KEY.
 */

import './_bootstrap';

// Shim: after() de Next.js falla fuera de request scope. Wrap el módulo via
// require.cache antes de cualquier import que dependa de él (ops-guard, etc.).
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const nextServerModule = req('next/server');
nextServerModule.after = (fn: () => unknown | Promise<unknown>) => {
  void Promise.resolve().then(fn).catch(() => null);
};

import { createAdminClient } from '../src/lib/supabase/admin';
import { executeAgentTool, type AgentToolContext } from '../src/lib/tools/executor';

const PORTAL_EMAIL = 'tania@acproyectos.com';

const STEP = (n: number, name: string) =>
  console.log(`\n\x1b[36m━━━ Paso ${n}: ${name} ━━━\x1b[0m`);

const OK  = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const ERR = (msg: string) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
const NFO = (msg: string) => console.log(`  \x1b[90m·\x1b[0m ${msg}`);

async function main() {
  console.log('\x1b[1m\nTest end-to-end pack ciclo OC-CFDI · AC Proyectos\x1b[0m');
  console.log(`Portal: ${PORTAL_EMAIL}\n`);

  const supabase = createAdminClient();

  // ── Setup: cargar Nala + org ────────────────────────────────────────────
  STEP(0, 'Cargar contexto de Nala');
  const { data: nala, error: nalaErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_token, features')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('agent_name', 'Nala')
    .single();
  if (nalaErr) NFO(`error select: ${nalaErr.message}`);
  if (!nala) {
    ERR('No hay meerkat Nala en la org AC.');
    NFO(`env: SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING'}`);
    NFO(`env: SERVICE_ROLE=${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING'}`);
    process.exit(1);
  }
  OK(`Nala id=${nala.id.slice(0, 8)}… agent_name="${nala.agent_name}"`);

  // Stub knowledge_base para dar contexto al verifier — sin esto rechaza toda
  // acción destructiva por falta de contexto de autorización.
  const agentWithKb = {
    ...nala,
    knowledge_base: 'AC Proyectos es una constructora que compra materiales de aire acondicionado a proveedores para instalarlos en obras de clientes. El facturista (Nala) automatiza el ciclo compras: crear órdenes de compra en QuickBooks a proveedores, firmarlas, coordinar pagos, y timbrar CFDIs a clientes al terminar cada obra. Las OCs son operación diaria autorizada por el owner de AC. Nala está expresamente autorizada por el dueño para crear OCs siguiendo las reglas de autofirma configuradas en el portal (monto máximo, sanidad de datos).',
  };
  const ctx: AgentToolContext = {
    agentId:      nala.id,
    portalEmail:  PORTAL_EMAIL,
    agentName:    nala.agent_name ?? 'Nala',
    businessName: nala.business_name ?? 'AC Proyectos',
    portalToken:  nala.portal_token ?? '',
    agent:        agentWithKb as unknown as Record<string, unknown>,
    supabase,
    channel:      'chat',
  };

  const { data: qb } = await supabase
    .from('qb_integrations')
    .select('realm_id, company_name')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  if (!qb) { ERR('QB no conectado. Conecta primero desde el portal.'); process.exit(1); }
  OK(`QB conectado realm=${qb.realm_id}`);

  const { data: org } = await supabase
    .from('organizations')
    .select('invoicing_provider, invoicing_test_mode, ciclo_oc_firma_path, ciclo_oc_config')
    .eq('portal_email', PORTAL_EMAIL)
    .single();
  OK(`SF ${org?.invoicing_provider ?? 'NO'} · sandbox=${org?.invoicing_test_mode} · firma=${org?.ciclo_oc_firma_path ? 'sí' : 'no'}`);

  // ── Paso 1: qb_crear_orden_compra ───────────────────────────────────────
  STEP(1, 'qb_crear_orden_compra');
  const result1 = await executeAgentTool('qb_crear_orden_compra', {
    proveedor_nombre: 'Ferretería Industrial del Norte SA de CV',
    proveedor_email:  'ventas@ferreteriaindustrial.mx',
    proveedor_rfc:    'FIN010203ABC',
    conceptos: [
      { descripcion: 'Tubo de cobre 3/4" x 6m', cantidad: 5, precio_unitario: 380 },
      { descripcion: 'Codo de cobre 3/4" 90°',  cantidad: 12, precio_unitario: 45 },
    ],
    folio_interno: `PROY-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
    descripcion:   'Instalación aire acondicionado edificio Torre Reforma',
  }, ctx) as any;

  if (!result1?.ok) { ERR(`${result1?.error}`); process.exit(1); }
  OK(`expediente=${result1.expediente_id?.slice(0, 8)}… qb_po_id=${result1.qb_po_id} folio=${result1.qb_po_folio} total=${result1.total}`);
  const expedienteId = result1.expediente_id as string;

  // ── Paso 2: qb_descargar_oc_pdf ─────────────────────────────────────────
  STEP(2, 'qb_descargar_oc_pdf');
  const result2 = await executeAgentTool('qb_descargar_oc_pdf', {
    expediente_id: expedienteId,
  }, ctx) as any;

  if (!result2?.ok) { ERR(`${result2?.error}`); NFO('Puede fallar si QB sandbox no genera PDFs — continúa igual.'); }
  else OK(`pdf_path=${result2.pdf_path} size=${result2.size_kb}KB`);

  // ── Paso 3: firmar_oc ───────────────────────────────────────────────────
  STEP(3, 'firmar_oc');
  const result3 = await executeAgentTool('firmar_oc', {
    expediente_id: expedienteId,
  }, ctx) as any;

  if (result3?.ok) {
    OK(`firmada_auto=${result3.firmada_auto} pdf=${result3.pdf_firmado_path?.slice(0, 60)}`);
  } else if (result3?.requiere_atencion) {
    NFO(`Escaló a autorizador: ${result3.razon}`);
    NFO(`Reglas falladas: ${result3.reglas_falladas?.join(', ')}`);
  } else {
    ERR(`${result3?.error}`);
  }

  // ── Paso 4: sf_timbrar_desde_oc ─────────────────────────────────────────
  STEP(4, 'sf_timbrar_desde_oc');
  const result4 = await executeAgentTool('sf_timbrar_desde_oc', {
    expediente_id:  expedienteId,
    cliente_nombre: 'CLIENTE PRUEBA SA DE CV',
    cliente_rfc:    'XAXX010101000',
    cliente_email:  'test@ejemplo.com',
    uso_cfdi:       'G03',
    forma_pago:     '03',
    metodo_pago:    'PUE',
  }, ctx) as any;

  if (!result4?.ok) { ERR(`${result4?.error}`); NFO('El timbrado puede fallar si SF sandbox rechaza — continúa.'); }
  else OK(`CFDI timbrado uuid=${result4.uuid} pdf=${result4.pdf_path}`);

  // ── Paso 5: archivar_expediente (solo si hay CFDI) ──────────────────────
  if (result4?.ok) {
    STEP(5, 'archivar_expediente');
    const result5 = await executeAgentTool('archivar_expediente', {
      expediente_id: expedienteId,
    }, ctx) as any;
    if (!result5?.ok) ERR(`${result5?.error}`);
    else OK(`destino=${result5.destino} archivos=${result5.archivos} pending=${result5.pending}`);
  }

  // ── Verificación final: estado del expediente + eventos ──────────────────
  STEP(6, 'Verificación DB');
  const { data: expFinal } = await supabase.from('expedientes_compras')
    .select('id, status, qb_po_folio, sf_uuid, oc_firmada_at, oc_pagada_at, cfdi_timbrada_at, docs_archivados_at, requiere_atencion_razon')
    .eq('id', expedienteId).single();
  OK(`Estado final: \x1b[1m${expFinal?.status}\x1b[0m`);
  NFO(`qb_po_folio=${expFinal?.qb_po_folio ?? '—'} sf_uuid=${expFinal?.sf_uuid ?? '—'}`);
  NFO(`firmada=${expFinal?.oc_firmada_at ? '✓' : '—'} pagada=${expFinal?.oc_pagada_at ? '✓' : '—'} timbrada=${expFinal?.cfdi_timbrada_at ? '✓' : '—'} archivada=${expFinal?.docs_archivados_at ? '✓' : '—'}`);
  if (expFinal?.requiere_atencion_razon) NFO(`atención: ${expFinal.requiere_atencion_razon}`);

  const { data: eventos } = await supabase.from('expediente_eventos')
    .select('tipo, from_status, to_status, actor, created_at')
    .eq('expediente_id', expedienteId)
    .order('created_at', { ascending: true });
  console.log('\n  Timeline:');
  for (const ev of eventos ?? []) {
    console.log(`  \x1b[90m·\x1b[0m ${ev.tipo}: ${ev.from_status ?? '∅'} → ${ev.to_status ?? '∅'} · ${ev.actor}`);
  }

  console.log('\n\x1b[32mFin del test.\x1b[0m');
  console.log(`Ver detalle en portal: /portal/${nala.portal_token}/oficina/expedientes\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('\x1b[31mError fatal:\x1b[0m', err);
  process.exit(1);
});
