/**
 * F6 battle test: end-to-end attachment upload for a civic report.
 *   1. Create a throwaway civic_report row for Sofia (Pneuma Studio) with a
 *      unique folio.
 *   2. POST a real 1x1 PNG via multipart to /api/public/civic-report-attach.
 *   3. Verify row lands in civic_report_attachments, file exists in storage,
 *      signed URL returns 200 with the same bytes.
 *   4. Verify limit rejection: try uploading a bogus text/plain (should 400)
 *      and try uploading >5 files (should 400 on the 6th).
 *   5. GET /api/portal/[token]/civic-reports/[folio]/attachments — assert list.
 *   6. Cleanup: delete uploads + row.
 */
import { loadEnv } from './_env';
loadEnv();

import { createClient } from '@supabase/supabase-js';
import { createSession, PORTAL_COOKIE } from '../../src/lib/portal/auth';

const APP           = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const PORTAL_EMAIL  = 'studio@pneumastudio.mx';
const PORTAL_TOKEN  = '8892c013-b122-4f11-a9d4-e88a04aff732';
const SOFIA_ID      = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

// 1x1 transparent PNG
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000114944415478da63fcffff3f0300050001010028cad7f80000000049454e44ae426082',
  'hex',
);

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Step 1 — throwaway report
  const folio = `BATTLE-${Date.now().toString(36).toUpperCase()}`;
  const { data: report, error: repErr } = await s.from('civic_reports').insert({
    agent_id:      SOFIA_ID,
    folio,
    category:      'otro',
    description:   'BATTLE TEST — reporte de prueba, borrar',
    caller_number: '+528123456789',
    caller_name:   'Battle Tester',
    status:        'abierto',
  }).select('id, folio').single();
  if (repErr) throw repErr;
  console.log(`✓ Created report ${report.folio} (id=${report.id.slice(0, 8)}…)`);

  // Step 2 — real multipart POST
  const fd = new FormData();
  fd.append('folio', report.folio);
  fd.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'test.png');
  const uploadRes = await fetch(`${APP}/api/public/civic-report-attach`, { method: 'POST', body: fd });
  const uploadBody = await uploadRes.json();
  console.log(`\n[upload] HTTP ${uploadRes.status}:`, uploadBody);

  if (!uploadBody.ok) throw new Error('Upload failed: ' + JSON.stringify(uploadBody));

  // Step 3a — DB row present
  const { data: rows } = await s.from('civic_report_attachments').select('*').eq('report_id', report.id);
  console.log(`\n[db] civic_report_attachments rows: ${rows?.length}`);
  console.log(`     storage_path: ${rows?.[0]?.storage_path}`);
  console.log(`     mime_type: ${rows?.[0]?.mime_type}, size: ${rows?.[0]?.size_bytes}`);

  // Step 3b — storage file exists (via createSignedUrl) + bytes match
  const path = rows![0].storage_path as string;
  const { data: signed } = await s.storage.from('civic-attachments').createSignedUrl(path, 60);
  const dl = await fetch(signed!.signedUrl);
  const dlBytes = new Uint8Array(await dl.arrayBuffer());
  const bytesMatch = dlBytes.length === PNG_BYTES.length && Buffer.from(dlBytes).equals(PNG_BYTES);
  console.log(`\n[storage] signed URL: ${signed?.signedUrl?.slice(0, 80)}…`);
  console.log(`     bytes match: ${bytesMatch ? '✅' : '🔴'}`);

  // Step 4 — invalid mime rejection
  const badFd = new FormData();
  badFd.append('folio', report.folio);
  badFd.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'not.txt');
  const badRes = await fetch(`${APP}/api/public/civic-report-attach`, { method: 'POST', body: badFd });
  console.log(`\n[reject-mime] HTTP ${badRes.status}: ${(await badRes.json()).error}`);

  // Step 5 — hit the 5-file cap (already at 1; upload 4 more, then expect 6th to fail)
  console.log('\n[limit] uploading 4 more (should succeed), then 6th (should reject)…');
  for (let i = 2; i <= 5; i++) {
    const fd2 = new FormData();
    fd2.append('folio', report.folio);
    fd2.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), `test${i}.png`);
    const r = await fetch(`${APP}/api/public/civic-report-attach`, { method: 'POST', body: fd2 });
    console.log(`     #${i} → HTTP ${r.status}`);
  }
  const fdOver = new FormData();
  fdOver.append('folio', report.folio);
  fdOver.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'over.png');
  const overRes = await fetch(`${APP}/api/public/civic-report-attach`, { method: 'POST', body: fdOver });
  const overBody = await overRes.json();
  console.log(`     #6 → HTTP ${overRes.status}: ${overBody.error}`);
  console.log(`     expected 400 with "Máximo 5" → ${overRes.status === 400 && String(overBody.error).includes('Máximo 5') ? '✅' : '🔴'}`);

  // Step 6 — portal GET endpoint returns the list with signed URLs
  const cookie = await createSession(PORTAL_EMAIL);
  const listRes = await fetch(`${APP}/api/portal/${PORTAL_TOKEN}/civic-reports/${report.folio}/attachments`, {
    headers: { Cookie: `${PORTAL_COOKIE}=${cookie}` },
  });
  const listBody = await listRes.json();
  console.log(`\n[portal] HTTP ${listRes.status}, attachments: ${listBody.attachments?.length}`);
  console.log(`     first signed URL prefix: ${listBody.attachments?.[0]?.signedUrl?.slice(0, 80)}…`);

  // Cleanup
  const { data: all } = await s.from('civic_report_attachments').select('storage_path').eq('report_id', report.id);
  const paths = (all ?? []).map(a => a.storage_path as string);
  if (paths.length) await s.storage.from('civic-attachments').remove(paths);
  await s.from('civic_reports').delete().eq('id', report.id);
  console.log('\n✓ Cleaned up test report + attachments.');
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
