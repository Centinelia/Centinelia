/**
 * Test directo de buscar_documento_oficina + enviar_documento_oficina.
 * Bypass LLM: llama directo al helper con args de test.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { searchOfficeDocuments, formatDocsForAgent } from '../../src/lib/documents/ops-docs-search';

const PORTAL_EMAIL = 'studio@pneumastudio.mx';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log('══════════ buscar_documento_oficina — sin filtro ══════════\n');
  const all = await searchOfficeDocuments({ supabase: s as any, portalEmail: PORTAL_EMAIL, limit: 5 });
  console.log(`Encontrados: ${all.length}`);
  for (const d of all) {
    console.log(`  - "${d.title}" | kind=${d.kind} | client=${d.client_name} | ${d.created_at.slice(0, 10)}`);
  }
  console.log('\nFormatted for agent:');
  console.log(formatDocsForAgent(all));

  console.log('\n\n══════════ buscar_documento_oficina — filtro kind=factura ══════════\n');
  const facturas = await searchOfficeDocuments({ supabase: s as any, portalEmail: PORTAL_EMAIL, kind: 'factura', limit: 5 });
  console.log(`Facturas: ${facturas.length}`);
  for (const d of facturas) console.log(`  - ${d.title}`);

  console.log('\n\n══════════ buscar_documento_oficina — filtro por cliente ══════════\n');
  const client = await searchOfficeDocuments({ supabase: s as any, portalEmail: PORTAL_EMAIL, clientName: 'test', limit: 5 });
  console.log(`Con "test" en client_name: ${client.length}`);

  console.log('\n\n══════════ enviar_documento_oficina — dry-check ══════════');
  console.log('(No mando correo real. Solo valido que la validación IDOR funcione.)');
  const { sendOfficeDocumentByEmail } = await import('../../src/lib/documents/ops-docs-search');
  const dryRun = await sendOfficeDocumentByEmail({
    supabase: s as any, portalEmail: PORTAL_EMAIL,
    agentId: 'c45e6e48-1ca5-4d0a-bbd3-2a62b7dbdad2', // Nox
    documentId: '00000000-0000-0000-0000-000000000000', // invalid
    to: 'test@example.com',
    subject: 'Test',
    body: 'Test',
  });
  console.log('resultado con documentId inválido:', dryRun);
  console.log(`  Esperado: ok=false con "Documento no encontrado" → ${dryRun.error === 'Documento no encontrado.' ? '✅' : '🔴'}`);
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
