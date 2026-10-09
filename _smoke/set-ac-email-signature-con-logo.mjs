// Actualiza la firma email de AC Proyectos con el logo embebido (data URL).
// Logo: C:\Users\Nazre\Dropbox\...\Logo AC Proyectos.png (34 KB)
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/set-ac-email-signature-con-logo.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';

const LOGO_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Logo AC Proyectos.png';
if (!fs.existsSync(LOGO_PATH)) { console.error('Logo no encontrado:', LOGO_PATH); process.exit(1); }

const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoBase64}`;
console.log(`  Logo: ${Math.round(fs.statSync(LOGO_PATH).size / 1024)} KB → data URL ${Math.round(logoBase64.length / 1024)} KB`);

// Firma con logo arriba + info debajo (replica el screenshot original de Camila)
const FIRMA_HTML = `
<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11pt;color:#333;line-height:1.5">
  <img src="${logoDataUrl}" alt="AC Proyectos" style="height:60px;width:auto;margin-bottom:8px" />
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
const { error } = await sb.from('organizations').update({ inventory_excel_config: updated }).eq('portal_email', PORTAL);
if (error) { console.error('err:', error); process.exit(1); }

console.log(`\n✓ Firma actualizada con logo (${Math.round(FIRMA_HTML.length / 1024)} KB total HTML).`);
