import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const localPath = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Logo AC Proyectos.png';
  const bytes = readFileSync(localPath);
  console.log(`Logo size: ${bytes.length} bytes`);

  // Try common bucket names for brand assets
  const candidateBuckets = ['brand-assets', 'public', 'logos', 'org-logos', 'assets'];
  let targetBucket = '';
  for (const b of candidateBuckets) {
    const { data, error } = await sb.storage.getBucket(b);
    if (!error && data) {
      targetBucket = b;
      console.log(`Using existing bucket: ${b} (public: ${data.public})`);
      break;
    }
  }
  if (!targetBucket) {
    // Create a public bucket for brand assets
    const { data, error } = await sb.storage.createBucket('brand-assets', { public: true });
    if (error) { console.error('createBucket:', error); return; }
    targetBucket = 'brand-assets';
    console.log(`Created bucket: brand-assets`);
  }

  const path = `ac-proyectos/logo.png`;
  const { error: upErr } = await sb.storage.from(targetBucket).upload(path, bytes, {
    contentType: 'image/png',
    upsert: true,
  });
  if (upErr) { console.error('upload:', upErr); return; }

  const { data: pub } = sb.storage.from(targetBucket).getPublicUrl(path);
  console.log(`\nPublic URL: ${pub.publicUrl}`);

  // Update organizations
  const { error: updErr } = await sb
    .from('organizations')
    .update({ logo_url: pub.publicUrl })
    .eq('portal_email', 'camila@acproyectos.com');
  if (updErr) { console.error('update:', updErr); return; }

  console.log(`\n✅ organizations.logo_url actualizado para AC Proyectos`);

  // Verify
  const { data: org } = await sb.from('organizations').select('logo_url').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
  console.log(`\nVerificación: logo_url = ${(org as any)?.logo_url}`);
}
main().catch(e => { console.error(e); process.exit(1); });
