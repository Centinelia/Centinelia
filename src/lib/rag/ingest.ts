// Handler genérico de ingest de fichas informativas.
//
// Flujo:
//   1. Parsea el texto del PDF (unpdf).
//   2. Extrae metadatos con el parser elegido:
//      - 'llm' (default): parser genérico con Claude Sonnet 4.6.
//      - 'santiago': parser regex específico para plantilla del Municipio
//                    de Santiago NL (opt-in via env INGEST_PARSER).
//   3. Auto-activa el feature `fichas_informativas` en el org si es la
//      primera ficha subida.
//   4. Sube el PDF al bucket `fichas-informativas`.
//   5. Upsert de la row en `fichas_informativas` con contactos extraídos.
//   6. Chunkea por sección + embed (solo si mode='embeddings') + inserta
//      en `fichas_informativas_chunks`.
//
// Usado por el UI portal (POST /api/portal/[token]/fichas) y por scripts.

import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseFileToText } from '@/lib/connectors/parse';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { parseFichaWithLLM } from './parse-ficha-llm';
import { parseFichaSantiago } from './parse-ficha-santiago';
import { chunkSections } from './chunk';
import { embedTexts } from './embed';
import { autotagFicha } from '@/lib/autotag/service';

export type IngestParserKind = 'llm' | 'santiago';
export type FichaMode       = 'stuffed' | 'embeddings';

export interface IngestOpts {
  portalEmail: string;
  filename:    string;
  uploadedBy?: string;
  parser?:     IngestParserKind;
  mode?:       FichaMode;
  /** ID del voice_agent al que atribuye el cargo. Si se omite, no cobra. */
  agentId?:    string;
  /**
   * Tags ya aprobados por el cliente (desde el modal de nueva ficha).
   * Si se pasan, se usan directamente con autotag_status='manual_override'.
   * Si no se pasan, se corre autotag síncrono.
   *
   * Cobro: el autotag NO cobra ops. Costo absorbido por Centinelia (~$0.001).
   * Ver feedback_batch_eval_no_charge y spec Sección 3 "Cobro autotag".
   */
  tags?:          string[];
  enableAutotag?: boolean;
}

export interface IngestResult {
  ficha_id:       string;
  codigo:         string;
  titulo:         string;
  chunks_count:   number;
  mode:           FichaMode;
  auto_activated: boolean;
  /** Tags asignados a la ficha (autotag o manual_override). */
  tags:           string[];
  autotag_status: string;
  contactos_extraidos: {
    nombre:    string | null;
    puesto:    string | null;
    correo:    string | null;
    telefono:  string | null;
    extension: string | null;
  };
}

export async function ingestFicha(pdfBuffer: Buffer, opts: IngestOpts): Promise<IngestResult> {
  const { portalEmail, filename } = opts;
  const parserKind: IngestParserKind = opts.parser ?? 'llm';
  const supabase = createAdminClient();

  const rawText = await parseFileToText(pdfBuffer, 'application/pdf');
  if (!rawText || rawText.trim().length < 50) {
    throw new Error('Ingest: el PDF no contiene texto legible (menos de 50 caracteres extraídos)');
  }

  const parsed = parserKind === 'santiago'
    ? parseFichaSantiago(rawText, { filenameHint: filename })
    : await parseFichaWithLLM(rawText, { portalEmail, source: 'fichas-ingest' });

  if (!parsed.codigo || !parsed.titulo) {
    throw new Error('Ingest: parser no pudo extraer código o título del PDF');
  }

  // Auto-activar feature si es primera ficha del org (o si el flag estaba false).
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  if (orgErr) throw new Error(`Ingest: query organizations error: ${orgErr.message}`);
  if (!org) throw new Error(`Ingest: organización ${portalEmail} no existe`);

  const currentFeatures  = (org.features as Record<string, unknown> | undefined) ?? {};
  const featureAlreadyOn = currentFeatures.fichas_informativas === true;
  const mode: FichaMode  = opts.mode
    ?? (currentFeatures.fichas_informativas_mode as FichaMode | undefined)
    ?? 'stuffed';

  let autoActivated = false;
  if (!featureAlreadyOn) {
    const newFeatures = { ...currentFeatures, fichas_informativas: true, fichas_informativas_mode: mode };
    const { error: upFeatErr } = await supabase
      .from('organizations')
      .update({ features: newFeatures })
      .eq('portal_email', portalEmail);
    if (upFeatErr) throw new Error(`Ingest: no se pudo activar feature: ${upFeatErr.message}`);
    autoActivated = true;
  }

  // Storage upload
  const safeCodigoForPath = parsed.codigo.replace(/[^A-Za-z0-9_.-]/g, '_');
  const storagePath = `${portalEmail}/${safeCodigoForPath}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('fichas-informativas')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`Ingest: storage upload error: ${upErr.message}`);

  const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

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
        uploaded_by:           opts.uploadedBy ?? 'portal',
      },
      { onConflict: 'portal_email,codigo' }
    )
    .select('id')
    .single();
  if (insErr) throw new Error(`Ingest: insert ficha error: ${insErr.message}`);

  // ── Autotag ──────────────────────────────────────────────────────────────
  // Cobro: NINGUNO. El autotag al crear una ficha está absorbido como parte
  // del setup. No cobra ops al cliente. Ver feedback_batch_eval_no_charge.
  let finalTags: string[] = [];
  let autotagStatus = 'pending';

  // C1 fix: el autotag solo corre si el caller LO PIDE explícito.
  // Sin esta guarda, cualquier script que llame ingestFicha() sin el flag
  // corría Sonnet silenciosamente (opts.tags podía ser undefined y la
  // condición anterior pasaba de todas formas).
  if (opts.enableAutotag === true) {
    if (opts.tags !== undefined) {
      // C2 fix: la PRESENCIA de opts.tags = intención explícita del cliente,
      // independientemente de si el array está vacío o no.
      // opts.tags = []  → el cliente deseleccionó todos los chips → manual_override válido.
      // opts.tags = ['x'] → el cliente aprobó chips → manual_override.
      finalTags     = opts.tags;
      autotagStatus = 'manual_override';
    } else {
      // Cliente NO envió tags → correr autotag síncrono.
      const autotagText = parsed.rawText ?? parsed.titulo ?? '';
      const autotagResult = await autotagFicha(portalEmail, autotagText);
      finalTags     = autotagResult.tags;
      autotagStatus = autotagResult.status;
    }

    // Actualizar la row con tags + autotag_status
    await supabase
      .from('fichas_informativas')
      .update({ tags: finalTags, autotag_status: autotagStatus })
      .eq('id', fichaRow.id);
  }

  // Chunkear
  const header = [parsed.codigo, parsed.titulo, parsed.dependencia, parsed.unidadAdministrativa]
    .filter(Boolean)
    .join(' — ');
  const chunks = chunkSections(parsed.sections, header);

  // Embed (solo si mode='embeddings')
  const embeddings: (number[] | null)[] = mode === 'embeddings'
    ? await embedTexts(chunks.map((c) => c.content), { source: 'fichas-ingest-embed', portalEmail })
    : chunks.map(() => null);

  // Reemplazar chunks (re-ingest scenario)
  await supabase.from('fichas_informativas_chunks').delete().eq('ficha_id', fichaRow.id);

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
  if (chunkErr) throw new Error(`Ingest: insert chunks error: ${chunkErr.message}`);

  // Cobro: 1 op por ficha subida (regla de pricing fichas_informativas 2026-09-23).
  // Solo cobra si viene agentId — scripts internos / seeds pasan sin agentId y no cobran.
  if (opts.agentId) {
    await consumeAiOp(opts.agentId, 1, {
      source:  'ingest_ficha_informativa',
      ficha_id: fichaRow.id,
      label:   `Ficha subida: ${parsed.titulo}`,
    });
  }

  return {
    ficha_id:       fichaRow.id,
    codigo:         parsed.codigo,
    titulo:         parsed.titulo,
    chunks_count:   chunks.length,
    mode,
    auto_activated: autoActivated,
    tags:           finalTags,
    autotag_status: autotagStatus,
    contactos_extraidos: {
      nombre:    parsed.contactoNombre,
      puesto:    parsed.contactoPuesto,
      correo:    parsed.contactoCorreo,
      telefono:  parsed.contactoTelefono,
      extension: parsed.contactoExtension,
    },
  };
}
