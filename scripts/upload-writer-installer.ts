/**
 * scripts/upload-writer-installer.ts
 *
 * Sube el installer del writer .NET al bucket `writer-installers` de Supabase.
 * Uso:
 *   npx tsx scripts/upload-writer-installer.ts <path-to-zip> [version]
 *
 * Ejemplo:
 *   npx tsx scripts/upload-writer-installer.ts C:/Users/Nazre/Desktop/centinelia-writer.zip 0.10.4
 *
 * Key: `writer/centinelia-writer-v<version>.zip` — se sobrescribe si ya existe.
 * Además pone la versión como `latest.txt` para que el endpoint API sepa cuál es
 * la vigente sin listar el bucket.
 */
import './_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';
import { readFile } from 'fs/promises';
import { basename } from 'path';

const BUCKET = 'writer-installers';

async function main(): Promise<void> {
  const [, , src, version] = process.argv;
  if (!src) {
    console.error('uso: npx tsx scripts/upload-writer-installer.ts <path-to-zip> [version]');
    process.exit(1);
  }
  const v = version ?? '0.10.4';
  const key = `writer/centinelia-writer-v${v}.zip`;

  const buf = await readFile(src);
  console.log(`leyendo ${basename(src)} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

  const supabase = createAdminClient();
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(key, buf, {
    contentType: 'application/zip',
    upsert:      true,
  });
  if (uploadErr) {
    console.error('upload failed:', uploadErr.message);
    process.exit(2);
  }
  console.log(`subido: ${BUCKET}/${key}`);

  const { error: latestErr } = await supabase.storage.from(BUCKET).upload('writer/latest.txt', Buffer.from(v, 'utf8'), {
    contentType: 'text/plain',
    upsert:      true,
  });
  if (latestErr) {
    console.error('latest.txt failed:', latestErr.message);
    process.exit(3);
  }
  console.log(`latest.txt actualizado a v${v}`);
}

main().catch(err => {
  console.error('failed:', err);
  process.exit(1);
});
