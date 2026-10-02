// Revierte setup de BACKLOG_NAMI: Camila autorizó migrar a hoja única.
//
// Cambios (idempotentes):
//   1. inventory_excel_config.sheets.backlog.name: 'BACKLOG_NAMI' → 'BACKLOG'
//   2. Borrar hoja BACKLOG_NAMI del Excel real (ya no se usa)
//
// NO toca las 47 filas del BACKLOG humano. El reemplazo se hará EN VIVO durante
// el Meet con `inv_importar_backlog mode=replace` para preservar el "wow moment".
// Si Camila cambia de opinión en el Meet, el BACKLOG humano queda intacto.
//
// Backup del BACKLOG humano: ya existe en
// `C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/Muestra_para_Camila/01_Tu_BACKLOG_actual.xlsx`
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/revert-to-single-backlog.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error(ctx); process.exit(1); }

console.log('── 1. Revertir config sheets.backlog.name a "BACKLOG" ──');
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const cfg = org.inventory_excel_config;
const currentName = cfg?.sheets?.backlog?.name;
console.log('  Actual:', currentName);
if (currentName === 'BACKLOG') {
  console.log('  Ya está en BACKLOG → no-op');
} else {
  const updated = { ...cfg, sheets: { ...cfg.sheets, backlog: { ...cfg.sheets.backlog, name: 'BACKLOG', start_row: 5 } } };
  const { error } = await sb.from('organizations').update({ inventory_excel_config: updated }).eq('portal_email', PORTAL);
  if (error) { console.error('update err:', error); process.exit(1); }
  console.log('  ✓ Config:', currentName, '→ BACKLOG');
}

console.log('\n── 2. Borrar hoja BACKLOG_NAMI del Excel real ──');
const sheets = await GraphExcel.listWorksheets(ctx.token, ctx.config.location);
const target = sheets.find(s => s.name === 'BACKLOG_NAMI');
if (!target) {
  console.log('  No existe BACKLOG_NAMI → no-op');
} else {
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const { scope, itemId } = ctx.config.location;
  const prefix = `${GRAPH}/sites/${scope.siteId}${scope.driveId ? '/drives/' + scope.driveId : '/drive'}/items/${itemId}`;
  const r = await fetch(`${prefix}/workbook/worksheets('BACKLOG_NAMI')`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!r.ok) { console.error('delete err:', r.status, await r.text()); process.exit(1); }
  console.log('  ✓ Hoja BACKLOG_NAMI eliminada');
}

console.log('\n── 3. Verificar estado final ──');
const sheets2 = await GraphExcel.listWorksheets(ctx.token, ctx.config.location);
console.log('  Hojas en Excel real:', sheets2.map(s => s.name).join(', '));
const { data: org2 } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
console.log('  Config sheets.backlog:', JSON.stringify(org2.inventory_excel_config.sheets.backlog));

console.log('\n✓ DONE. Nami ahora apunta a BACKLOG original. El replace en vivo durante el Meet');
console.log('  limpiará las 47 filas humanas y pondrá las 45 del PDF TRANE. Backup del original en');
console.log('  Muestra_para_Camila/01_Tu_BACKLOG_actual.xlsx si Camila cambia de opinión.');
