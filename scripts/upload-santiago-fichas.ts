/**
 * Sube los PDFs oficiales del Municipio de Santiago NL al portal de
 * `santiago-dev@centinelia.mx` vía POST /api/portal/[token]/fichas.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/upload-santiago-fichas.ts
 *
 * Env vars requeridos (leídos de .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Env vars opcionales:
 *   CENTINELIA_BASE_URL (default https://www.centinelia.mx)
 *   PDFS_DIR (default C:/Users/Nazre/Dropbox/PC/Downloads/Municipio de Stgo)
 *   PORTAL_EMAIL (default santiago-dev@centinelia.mx)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { ingestFicha } from '@/lib/rag/ingest';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORTAL_EMAIL = process.env.PORTAL_EMAIL ?? 'santiago-dev@centinelia.mx';
const PDFS_DIR = process.env.PDFS_DIR ?? 'C:/Users/Nazre/Dropbox/PC/Downloads/Municipio de Stgo';

async function main(): Promise<void> {
  if (!SUPA_URL || !SUPA_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos');
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY);

  // 1. Obtener primary agent del org (para atribución de cargo del autotag setup)
  const { data: agentRow, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (agentErr) throw new Error(`Error consultando voice_agents: ${agentErr.message}`);
  if (!agentRow?.id) throw new Error(`No hay voice_agents activos para ${PORTAL_EMAIL}`);

  const agentId = agentRow.id as string;
  console.log(`[upload-santiago] Portal: ${PORTAL_EMAIL} | agent_id: ${agentId.slice(0, 8)}...`);
  console.log('[upload-santiago] Modo: ingestFicha directo (bypass endpoint auth)');

  // 2. Listar PDFs del directorio
  if (!fs.existsSync(PDFS_DIR)) {
    throw new Error(`Directorio no existe: ${PDFS_DIR}`);
  }
  const files = fs.readdirSync(PDFS_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`[upload-santiago] ${files.length} PDFs encontrados en ${PDFS_DIR}`);

  if (files.length === 0) {
    console.log('[upload-santiago] Nada que subir.');
    return;
  }

  // 3. Subir cada uno secuencialmente (evita rate limit y ordena log)
  let ok = 0;
  let fail = 0;
  const results: Array<{ filename: string; status: 'ok' | 'fail'; detail: string }> = [];

  for (const filename of files) {
    const filepath = path.join(PDFS_DIR, filename);
    const buffer = fs.readFileSync(filepath);

    process.stdout.write(`[upload-santiago] ${filename}... `);

    try {
      const result = await ingestFicha(buffer, {
        portalEmail:   PORTAL_EMAIL,
        filename,
        uploadedBy:    'upload-santiago-script',
        parser:        'llm',
        agentId,
        enableAutotag: true,
      });
      const tagsStr = result.tags.length > 0 ? result.tags.join(', ') : '(sin tags sugeridos)';
      const autoStr = result.auto_activated ? ' [auto-activated]' : '';
      console.log(`OK · "${result.titulo}" · ${result.chunks_count} chunks · tags: ${tagsStr}${autoStr}`);
      ok++;
      results.push({
        filename,
        status: 'ok',
        detail: `${result.titulo} | ${result.chunks_count} chunks | ${tagsStr}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL · ${msg}`);
      fail++;
      results.push({ filename, status: 'fail', detail: msg });
    }
  }

  // 4. Resumen
  console.log('\n[upload-santiago] ═══════════════════════════════════════');
  console.log(`[upload-santiago] Resumen: ${ok} OK, ${fail} FAIL de ${files.length} totales`);
  console.log('[upload-santiago] ═══════════════════════════════════════');

  if (fail > 0) {
    console.log('\n[upload-santiago] Detalles de fallos:');
    for (const r of results.filter(r => r.status === 'fail')) {
      console.log(`  ✗ ${r.filename}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[upload-santiago] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
