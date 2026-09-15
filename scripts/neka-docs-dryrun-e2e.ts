// scripts/neka-docs-dryrun-e2e.ts
//
// End-to-end del feature de docs por cliente:
//   1. Crea (o reusa) un cliente de prueba
//   2. Sube un PDF dummy via uploadClienteDoc
//   3. Verifica que aparece en el JSONB docs
//   4. Genera signed URL y descarga los bytes
//   5. Verifica que los bytes coinciden con lo subido
//   6. Borra el doc via deleteClienteDoc
//   7. Verifica cleanup (no quedan bytes en storage ni entry en JSONB)
//
// Requiere: migracion 20260915140000 aplicada + bucket creado.
// Uso: npx tsx scripts/neka-docs-dryrun-e2e.ts

import { config as dotenvConfig } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  uploadClienteDoc,
  deleteClienteDoc,
  getClienteDocSignedUrl,
} from '../src/lib/billing/centinelia-clientes-docs';

dotenvConfig({ path: '.env.local' });

const CLIENTE_RFC_TEST = 'XAXX010101000';           // RFC generico publico general — no toca clientes reales
const CLIENTE_LABEL    = 'PUBLICO EN GENERAL (E2E dryrun)';

async function ensureTestCliente(supabase: SupabaseClient): Promise<string> {
  const { data: existing } = await supabase
    .from('centinelia_clientes')
    .select('id')
    .eq('rfc', CLIENTE_RFC_TEST)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('centinelia_clientes')
    .insert({
      rfc:                       CLIENTE_RFC_TEST,
      razon_social:              CLIENTE_LABEL,
      cp:                        '64000',
      regimen_fiscal:            '616',
      uso_cfdi_default:          'S01',
      correo_facturacion:        'nazre20@gmail.com',
      nombre_contacto:           'E2E dryrun',
      activo:                    false,  // No debe procesarse en el cron
      conceptos:                 [{ descripcion: 'concepto dummy', valor_unitario: 1, cantidad: 1, con_iva: true }],
      periodicidad:              'monthly',
      fecha_proxima_facturacion: '2099-12-31',  // muy lejos
      metodo_pago_default:       'PPD',
      forma_pago_default:        '99',
      notas:                     'Cliente creado por scripts/neka-docs-dryrun-e2e.ts',
    })
    .select('id')
    .single();

  if (error) throw new Error(`insert cliente: ${error.message}`);
  return created!.id;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  console.log('=== NEKA DOCS E2E DRYRUN ===\n');

  // 1. Cliente de prueba
  console.log('[1/7] Preparando cliente de prueba...');
  const clienteId = await ensureTestCliente(supabase);
  console.log(`     cliente_id = ${clienteId}`);

  // 2. Upload PDF dummy
  console.log('\n[2/7] Subiendo PDF dummy (1KB)...');
  const pdfBytes = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.from('E2E dryrun payload — ' + Date.now() + '\n'),
    Buffer.alloc(1024 - 40, 0x20),
    Buffer.from('\n%%EOF\n'),
  ]);
  const uploadRes = await uploadClienteDoc({
    clienteId,
    tipo:        'csf',
    label:       'Dryrun CSF (' + new Date().toISOString() + ')',
    filename:    'dryrun-csf.pdf',
    contentType: 'application/pdf',
    content:     pdfBytes,
    uploadedBy:  'neka-docs-dryrun-e2e',
  }, supabase);

  if (!uploadRes.ok) {
    console.error(`     FAIL: ${uploadRes.code} — ${uploadRes.message}`);
    process.exit(1);
  }
  console.log(`     doc_id = ${uploadRes.doc.id}`);
  console.log(`     storage_path = ${uploadRes.doc.storage_path}`);
  console.log(`     size_bytes = ${uploadRes.doc.size_bytes}`);

  // 3. Verificar en JSONB
  console.log('\n[3/7] Verificando que el doc aparece en el array docs...');
  const { data: after, error: fetchErr } = await supabase
    .from('centinelia_clientes')
    .select('docs')
    .eq('id', clienteId)
    .single();
  if (fetchErr) throw fetchErr;
  const docsAfterUpload = (after?.docs ?? []) as Array<{ id: string; label: string }>;
  const found = docsAfterUpload.find(d => d.id === uploadRes.doc.id);
  if (!found) throw new Error('doc no aparece en JSONB despues del upload');
  console.log(`     OK — total docs en cliente ahora: ${docsAfterUpload.length}`);

  // 4. Signed URL
  console.log('\n[4/7] Generando signed URL (TTL 60s)...');
  const urlRes = await getClienteDocSignedUrl(clienteId, uploadRes.doc.id, 60, supabase);
  if (!urlRes.ok) {
    console.error(`     FAIL: ${urlRes.code} — ${urlRes.message}`);
    process.exit(1);
  }
  console.log(`     url expira: ${urlRes.expiresAt}`);

  // 5. Descargar y verificar bytes
  console.log('\n[5/7] Descargando via signed URL y comparando bytes...');
  const downloadRes = await fetch(urlRes.url);
  if (!downloadRes.ok) throw new Error(`download HTTP ${downloadRes.status}`);
  const downloaded = Buffer.from(await downloadRes.arrayBuffer());
  const matches = downloaded.equals(pdfBytes);
  console.log(`     bytes: subidos ${pdfBytes.length}, descargados ${downloaded.length}, coinciden: ${matches ? 'SI' : 'NO'}`);
  if (!matches) {
    console.error('     FAIL: los bytes descargados no coinciden con los subidos');
    process.exit(1);
  }

  // 6. Delete
  console.log('\n[6/7] Borrando doc...');
  const delRes = await deleteClienteDoc(clienteId, uploadRes.doc.id, supabase);
  if (!delRes.ok) {
    console.error(`     FAIL: ${delRes.code} — ${delRes.message}`);
    process.exit(1);
  }
  console.log(`     doc borrado: ${delRes.deleted.label}`);

  // 7. Verificar cleanup
  console.log('\n[7/7] Verificando cleanup...');
  const { data: afterDel } = await supabase
    .from('centinelia_clientes')
    .select('docs')
    .eq('id', clienteId)
    .single();
  const docsAfterDel = (afterDel?.docs ?? []) as Array<{ id: string }>;
  const stillThere = docsAfterDel.find(d => d.id === uploadRes.doc.id);
  console.log(`     JSONB post-delete tiene el doc: ${stillThere ? 'SI (BUG)' : 'NO'}`);

  const { data: dl2 } = await supabase.storage
    .from('centinelia-clientes-docs')
    .download(uploadRes.doc.storage_path);
  console.log(`     Storage post-delete accesible: ${dl2 ? 'SI (BUG)' : 'NO'}`);

  if (stillThere || dl2) {
    console.error('     FAIL: cleanup incompleto');
    process.exit(1);
  }

  console.log('\n=== E2E OK ===');
  console.log('7/7 pasos verdes. Fase A funcionando end-to-end contra Supabase dev.');
}

main().catch(e => { console.error('EXCEPCION:', e); process.exit(1); });
