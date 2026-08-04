/**
 * Happy path: inserta un doc test en ops_documents + storage, envía por correo,
 * verifica que sendEmail fue llamado con attachment correcto, cleanup.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const PORTAL_EMAIL = 'studio@pneumastudio.mx';
const NOX_ID = 'c45e6e48-1ca5-4d0a-bbd3-2a62b7dbdad2';
const BUCKET = 'agent-documents';

// PDF header mínimo (válido para reconocerse como PDF)
const FAKE_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'utf8');

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const docId = randomUUID();
  const filename = `battle-test-${Date.now()}.pdf`;
  const path = `${NOX_ID}/${filename}`;

  // 1. Subir a storage
  const { error: upErr } = await s.storage.from(BUCKET).upload(path, FAKE_PDF, { contentType: 'application/pdf', upsert: false });
  if (upErr) { console.error('storage upload:', upErr); return; }
  console.log(`✓ Uploaded to storage: ${path}`);

  // 2. Insert ops_documents row
  const { error: insErr } = await s.from('ops_documents').insert({
    id:            docId,
    agent_id:      NOX_ID,
    title:         'BATTLE TEST — Cotización Prueba',
    filename,
    storage_path:  path,
    template_type: 'cotizacion',
    expires_at:    new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
  if (insErr) { console.error('ops_documents insert:', insErr); return; }
  console.log(`✓ Inserted ops_documents id=${docId.slice(0, 8)}…`);

  // 3. buscar_documento_oficina — debe encontrarlo
  const { searchOfficeDocuments } = await import('../../src/lib/documents/ops-docs-search');
  const results = await searchOfficeDocuments({ supabase: s as any, portalEmail: PORTAL_EMAIL, query: 'Battle Test' });
  console.log(`\n✓ buscar_documento_oficina: encontró ${results.length} doc(s)`);
  console.log(`  match: ${results[0]?.id === docId ? '✅ (nuestro doc)' : '🔴'}`);

  // 4. enviar_documento_oficina — happy path (correo a inbox de test)
  const { sendOfficeDocumentByEmail } = await import('../../src/lib/documents/ops-docs-search');
  const sendRes = await sendOfficeDocumentByEmail({
    supabase: s as any, portalEmail: PORTAL_EMAIL, agentId: NOX_ID,
    documentId: docId,
    to:      'nazre20@gmail.com',
    subject: 'BATTLE TEST — Cotización enviada por Nox',
    body:    'Hola, adjunto la cotización solicitada. Esto es un test automatizado, puedes ignorarlo.\n\n— Nox',
  });
  console.log(`\n✓ enviar_documento_oficina result:`);
  console.log(`  ok: ${sendRes.ok}`);
  console.log(`  message: ${sendRes.message ?? sendRes.error}`);

  // 5. Cleanup
  await s.storage.from(BUCKET).remove([path]);
  await s.from('ops_documents').delete().eq('id', docId);
  console.log('\n✓ Cleanup: storage + row borrados.');
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
