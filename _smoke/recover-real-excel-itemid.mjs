// Recupera el itemId del Excel real "INVENTARIO NAMI 2026.xlsx" buscándolo
// en el SharePoint de Camila (search, no hardcoding) y restaura el DB config
// del org. Útil cuando un smoke dejó el DB apuntando a un sandbox borrado.

import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';

const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const cfg = org.inventory_excel_config;
console.log('── Config actual ──');
console.log('  itemId:', cfg.location.itemId);
console.log('  scope: ', JSON.stringify(cfg.location.scope));

// Grab token via adapter.resolveInventoryContext (resuelve el OAuth account)
const adapter = await import('../src/lib/inventory/adapter.ts');
const { data: agentRow } = await sb.from('voice_agents').select('*').eq('portal_email', PORTAL).limit(1).maybeSingle();
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, agentRow.id);
if ('error' in ctx) { console.error('ctx err:', ctx); process.exit(1); }
const token = ctx.token;

// Buscar por nombre dentro del drive
const scope = cfg.location.scope;
const driveBase = scope.type === 'site'
  ? `https://graph.microsoft.com/v1.0/sites/${scope.siteId}/drives/${scope.driveId}`
  : `https://graph.microsoft.com/v1.0/me/drive`;

const resp = await fetch(`${driveBase}/root/search(q='INVENTARIO NAMI 2026')?$select=id,name,parentReference,webUrl`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!resp.ok) { console.error('search err:', resp.status, await resp.text()); process.exit(1); }
const data = await resp.json();
const matches = (data.value ?? []).filter(x => /INVENTARIO NAMI 2026.*\.xlsx$/i.test(x.name));
console.log('\n── Matches ──');
matches.forEach(x => console.log(`  id=${x.id}  name=${x.name}  folder=${x.parentReference?.path ?? '?'}`));

if (matches.length === 0) { console.error('Sin match. Abort.'); process.exit(1); }

// Si hay múltiples, escoger la que NO esté en una carpeta _Centinelia_sandbox_
const real = matches.find(x => !/sandbox/i.test(x.parentReference?.path ?? '')) ?? matches[0];
console.log('\n── Elegido como real ──');
console.log('  id:    ', real.id);
console.log('  name:  ', real.name);
console.log('  path:  ', real.parentReference?.path);

if (real.id === cfg.location.itemId) {
  console.log('\n✓ DB ya apunta al Excel real. Sin cambios necesarios.');
  process.exit(0);
}

// Verificar que el Excel realmente existe antes de escribir
const verify = await fetch(`${driveBase}/items/${real.id}?$select=id,name`, { headers: { Authorization: `Bearer ${token}` } });
if (!verify.ok) { console.error('Verify err:', verify.status); process.exit(1); }
console.log('\n✓ Excel accesible, actualizando DB config...');

const updated = { ...cfg, location: { ...cfg.location, itemId: real.id } };
await sb.from('organizations').update({ inventory_excel_config: updated }).eq('portal_email', PORTAL);
const { data: v } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
console.log('\n── Config final ──');
console.log('  itemId:', v.inventory_excel_config.location.itemId);
console.log('\n✓ DB restaurado al Excel real.');
