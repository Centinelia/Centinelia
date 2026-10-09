// Sube el logo AC Proyectos a Supabase Storage (bucket público) y actualiza
// la firma del email con la URL pública. Gmail bloquea data: URLs en imágenes
// por seguridad, por eso necesitamos un host externo.
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/upload-ac-logo-storage.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';

const LOGO_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Logo AC Proyectos.png';
if (!fs.existsSync(LOGO_PATH)) { console.error('Logo no encontrado:', LOGO_PATH); process.exit(1); }

const BUCKET = 'org-assets';
const FILE_PATH = `ac-proyectos/logo.png`;

// 1. Verificar bucket existe (o crearlo público)
console.log('── 1. Verificar bucket "org-assets" ──');
const { data: buckets } = await sb.storage.listBuckets();
const bucketExists = buckets?.some(b => b.name === BUCKET);
if (!bucketExists) {
  console.log('  Bucket no existe, creándolo público...');
  const { error: createErr } = await sb.storage.createBucket(BUCKET, { public: true });
  if (createErr) { console.error('createBucket err:', createErr); process.exit(1); }
  console.log('  ✓ Bucket creado');
} else {
  console.log('  ✓ Bucket existe');
}

// 2. Subir logo
console.log(`\n── 2. Subir logo a ${BUCKET}/${FILE_PATH} ──`);
const logoBytes = fs.readFileSync(LOGO_PATH);
const { error: upErr } = await sb.storage.from(BUCKET).upload(FILE_PATH, logoBytes, {
  contentType: 'image/png',
  upsert: true,
});
if (upErr) { console.error('upload err:', upErr); process.exit(1); }
console.log(`  ✓ Subido (${Math.round(logoBytes.length / 1024)} KB)`);

// 3. Obtener URL pública
const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(FILE_PATH);
const publicUrl = urlData.publicUrl;
console.log(`\n── 3. URL pública ──`);
console.log(`  ${publicUrl}`);

// 4. Actualizar firma en config
console.log('\n── 4. Actualizar firma del org ──');
const FIRMA_HTML = `
<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11pt;color:#333;line-height:1.5">
  <img src="${publicUrl}" alt="AC Proyectos" style="height:60px;width:auto;margin-bottom:8px" />
  <p style="margin:0 0 4px 0"><strong>Camila Rodarte</strong></p>
  <p style="margin:0 0 10px 0;color:#555">Coordinadora de Almacén</p>
  <p style="margin:0;color:#555">Aire Acondicionado Proyectos, S.A. de C.V.</p>
  <p style="margin:0 0 10px 0;color:#555">Av. Pablo González 702, Col. Chepevera, C.P. 64030</p>
  <p style="margin:0;color:#555">Cel. 81 1908 8043</p>
  <p style="margin:0;color:#555"><a href="mailto:Camila@acproyectos.com" style="color:#0070c0">Camila@acproyectos.com</a></p>
</div>`.trim();

const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
if (!org) { console.error('Org no encontrada'); process.exit(1); }
const updated = { ...org.inventory_excel_config, email_signature_html: FIRMA_HTML };
const { error: upd } = await sb.from('organizations').update({ inventory_excel_config: updated }).eq('portal_email', PORTAL);
if (upd) { console.error('update err:', upd); process.exit(1); }

console.log(`  ✓ Firma actualizada (${Math.round(FIRMA_HTML.length / 1024)} KB — ahora pequeña, el logo lo trae via URL)`);

// 5. Verificación: fetch el URL público desde fuera para confirmar que carga
console.log('\n── 5. Verificar que el URL público carga ──');
try {
  const r = await fetch(publicUrl);
  console.log(`  HTTP ${r.status} ${r.statusText}, Content-Type: ${r.headers.get('content-type')}, Size: ${r.headers.get('content-length')} bytes`);
  if (r.ok) console.log('  ✓ URL carga correctamente desde internet');
  else console.log('  ⚠ URL no retornó OK');
} catch (err) {
  console.log('  ⚠ No pude verificar URL:', err.message);
}
