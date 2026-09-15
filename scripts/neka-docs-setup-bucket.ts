// scripts/neka-docs-setup-bucket.ts
//
// Crea el bucket `centinelia-clientes-docs` en Supabase Storage.
// La parte de bucket la maneja Storage API con service role — no requiere
// SQL editor. El ALTER TABLE del `docs JSONB` sigue requiriendo aplicar la
// migracion 20260915140000_centinelia_clientes_docs.sql en dashboard/CLI.
//
// Uso:
//   npx tsx scripts/neka-docs-setup-bucket.ts

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });

const BUCKET = 'centinelia-clientes-docs';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) {
    console.log(`Bucket "${BUCKET}" ya existe. Skip.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  });
  if (error) throw new Error(`createBucket: ${error.message}`);
  console.log(`Bucket "${BUCKET}" creado OK.`);
}

main().catch(e => { console.error(e); process.exit(1); });
