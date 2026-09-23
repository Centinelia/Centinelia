// Ingesta seed de las 3 fichas técnicas del Municipio de Santiago NL a la
// tabla fichas_informativas + fichas_informativas_chunks.
//
// Uso:
//   SANTIAGO_PORTAL_EMAIL="santiago@centinelia.mx" npx tsx scripts/ingest-fichas-santiago.ts
//
// Env opcionales:
//   INGEST_MODE=stuffed|embeddings  (default 'stuffed')
//     stuffed:    parsea + guarda ficha + secciones SIN embedding.
//                 No requiere OPENAI_API_KEY. Nara lee catálogo completo.
//     embeddings: parsea + chunk + embed via OpenAI + insert vectores.
//                 Requiere OPENAI_API_KEY (o MOCK_EMBEDDINGS=1 para dev).
//
// El PORTAL_EMAIL debe existir en tabla organizations. En dev inicial, crea
// una org de prueba antes de correr:
//   INSERT INTO organizations (portal_email, name) VALUES
//     ('santiago-dev@centinelia.mx', 'Municipio de Santiago NL — dev');
//
// El script:
//   1. Lee cada PDF del Dropbox
//   2. Parsea texto con unpdf
//   3. Extrae metadata + secciones con parseFichaSantiago
//   4. Sube el PDF original al bucket `fichas-informativas`
//   5. Upsert row en fichas_informativas
//   6. Chunks (siempre) + embeddings (solo en modo embeddings)
//   7. Insert en fichas_informativas_chunks

import './_bootstrap';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseFileToText } from '@/lib/connectors/parse';
import { parseFichaSantiago } from '@/lib/rag/parse-ficha-santiago';
import { chunkSections } from '@/lib/rag/chunk';
import { embedTexts } from '@/lib/rag/embed';

const DROPBOX_BASE = String.raw`C:\Users\Nazre\Dropbox\PC\Downloads\Municipio de Stgo`;

const FICHAS = [
  'TS-SFT-RIN-02 Pago del Impuesto Predial.pdf',
  'TS-SFT-ING-01 Pago y Aplicación de Descuento en Multas de Tránsito.pdf',
  'TS-SFT-RIN-01 Pago del Impuesto Sobre la Adquisición de Inmuebles (1).pdf',
];

async function main() {
  const portalEmail = process.env.SANTIAGO_PORTAL_EMAIL;
  if (!portalEmail) {
    throw new Error(
      'SANTIAGO_PORTAL_EMAIL no configurado. Ejemplo:\n  SANTIAGO_PORTAL_EMAIL="santiago-dev@centinelia.mx" npx tsx scripts/ingest-fichas-santiago.ts'
    );
  }
  const mode = (process.env.INGEST_MODE === 'embeddings') ? 'embeddings' : 'stuffed';
  console.log(`Ingest mode: ${mode}`);

  const supabase = createAdminClient();

  // Verificar que la org existe
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('portal_email, name')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  if (orgErr) throw new Error(`Query organizations error: ${orgErr.message}`);
  if (!org) {
    throw new Error(
      `La org "${portalEmail}" no existe. Créala primero:\n  INSERT INTO organizations (portal_email, business_name) VALUES ('${portalEmail}', 'Municipio de Santiago NL — dev');`
    );
  }
  console.log(`Org: ${org.name} <${org.portal_email}>\n`);

  for (const file of FICHAS) {
    const filePath = path.join(DROPBOX_BASE, file);
    console.log(`=== ${file} ===`);

    const buffer = await readFile(filePath);
    const text   = await parseFileToText(buffer, 'application/pdf');
    const parsed = parseFichaSantiago(text, { filenameHint: file });

    if (!parsed.codigo || !parsed.titulo) {
      console.warn(`  ⚠ codigo/titulo no detectado, saltando`);
      continue;
    }

    console.log(`  código:      ${parsed.codigo}`);
    console.log(`  título:      ${parsed.titulo}`);
    console.log(`  correo:      ${parsed.contactoCorreo}`);
    console.log(`  extensión:   ${parsed.contactoExtension}`);
    console.log(`  responsable: ${parsed.contactoNombre}`);
    console.log(`  liga:        ${parsed.ligaEnLinea}`);
    console.log(`  secciones:   ${parsed.sections.length}`);

    // Upload PDF a bucket
    const storagePath = `${portalEmail}/${parsed.codigo}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('fichas-informativas')
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error(`Storage upload error: ${upErr.message}`);

    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Upsert ficha
    const { data: fichaRow, error: insErr } = await supabase
      .from('fichas_informativas')
      .upsert(
        {
          portal_email:          portalEmail,
          codigo:                parsed.codigo,
          titulo:                parsed.titulo,
          dependencia:           parsed.dependencia,
          unidad_administrativa: parsed.unidadAdministrativa,
          contacto_nombre:       parsed.contactoNombre,
          contacto_puesto:       parsed.contactoPuesto,
          contacto_correo:       parsed.contactoCorreo,
          contacto_telefono:     parsed.contactoTelefono,
          contacto_extension:    parsed.contactoExtension,
          liga_en_linea:         parsed.ligaEnLinea,
          direccion:             parsed.direccion,
          horario:               parsed.horario,
          costo_descripcion:     parsed.costoDescripcion,
          plazo_respuesta:       parsed.plazoRespuesta,
          storage_path:          storagePath,
          file_hash:             fileHash,
          raw_text:              parsed.rawText,
          parsed_at:             new Date().toISOString(),
          uploaded_by:           'ingest-script',
        },
        { onConflict: 'portal_email,codigo' }
      )
      .select('id')
      .single();
    if (insErr) throw new Error(`Insert ficha error: ${insErr.message}`);

    // Chunks (siempre — el section_type + content son útiles para modo stuffed)
    const header = [parsed.codigo, parsed.titulo, parsed.dependencia, parsed.unidadAdministrativa]
      .filter(Boolean)
      .join(' — ');
    const chunks = chunkSections(parsed.sections, header);
    console.log(`  chunks:      ${chunks.length}`);

    // Embed solo si el modo lo requiere
    const embeddings: (number[] | null)[] = mode === 'embeddings'
      ? await embedTexts(chunks.map((c) => c.content), {
          source: 'nara-ingest-fichas-santiago',
          portalEmail,
        })
      : chunks.map(() => null);

    // Delete existing chunks (re-ingest scenario)
    await supabase.from('fichas_informativas_chunks').delete().eq('ficha_id', fichaRow.id);

    // Insert chunks
    const chunkRows = chunks.map((c, i) => ({
      ficha_id:     fichaRow.id,
      portal_email: portalEmail,
      chunk_index:  c.chunk_index,
      section_type: c.section_type,
      content:      c.content,
      token_count:  c.token_count,
      embedding:    embeddings[i] as unknown as string | null,
      metadata:     {},
    }));
    const { error: chunkErr } = await supabase.from('fichas_informativas_chunks').insert(chunkRows);
    if (chunkErr) throw new Error(`Insert chunks error: ${chunkErr.message}`);

    console.log(`  ✓ ingerida (mode=${mode})\n`);
  }

  console.log('✓ Todas las fichas ingeridas');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
