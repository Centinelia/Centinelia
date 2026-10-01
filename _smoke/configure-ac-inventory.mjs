// Resuelve el onedrive_share_url de AC a location.itemId/scope vía Graph API
// y escribe el config completo (defaults AC + listas canónicas) en
// organizations.inventory_excel_config.
//
// Precedente 2026-10-01: provisioning dejaba solo onedrive_share_url (staging
// shape); el adapter requería location.itemId. Nami invocaba inv_buscar_por_modelo
// y recibía "La organización no tiene inventory_excel_config seteado".
//
// Idempotente: skip si config.location.itemId ya está seteado.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('=');
  return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';

function encodeShareUrl(url) {
  const b64 = Buffer.from(url, 'utf-8').toString('base64');
  return 'u!' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const current = org?.inventory_excel_config ?? {};
console.log('Config actual keys:', Object.keys(current).join(', '));
if (current?.location?.itemId) {
  console.log('Ya tiene location.itemId=' + current.location.itemId + ' — skip.');
  process.exit(0);
}
const shareUrl = current.onedrive_share_url;
if (!shareUrl) { console.error('No hay onedrive_share_url'); process.exit(1); }
console.log('Share URL:', shareUrl);

const { data: emailInt } = await sb.from('email_integrations')
  .select('access_token, token_expires_at')
  .eq('agent_id', NAMI).eq('provider', 'outlook').maybeSingle();
if (!emailInt?.access_token) { console.error('Nami no tiene outlook en email_integrations'); process.exit(1); }
const expiresAt = new Date(emailInt.token_expires_at);
const minsLeft = Math.round((expiresAt.getTime() - Date.now()) / 60000);
console.log('Token Outlook expira en', minsLeft, 'minutos');
if (minsLeft < 2) {
  console.error('Token casi expirado; corre inbox-processor para refrescar o espera a Camila.');
  process.exit(1);
}

console.log('Resolviendo share URL via Graph...');
const r = await fetch(`https://graph.microsoft.com/v1.0/shares/${encodeShareUrl(shareUrl)}/driveItem?$select=id,parentReference,name`, {
  headers: { Authorization: `Bearer ${emailInt.access_token}` },
});
if (!r.ok) {
  console.error('Graph error:', r.status);
  console.error(await r.text());
  process.exit(1);
}
const item = await r.json();
console.log('driveItem:', JSON.stringify({ id: item.id, name: item.name, parentReference: item.parentReference }, null, 2));

const itemId  = item.id;
const driveId = item.parentReference?.driveId;
const siteId  = item.parentReference?.siteId;
if (!itemId) { console.error('No itemId'); process.exit(1); }

const scope = siteId
  ? { type: 'site', siteId, driveId }
  : driveId
    ? { type: 'site', siteId: driveId.split(',')[0] ?? driveId, driveId }
    : { type: 'me' };

const fullConfig = {
  ...current,
  location: { scope, itemId },
  sheets: {
    historico: { name: 'INVENTARIO', table: 'Tabla6' },
    stock: {
      name:              'STOCK',
      header_row:        1,
      ideal_column:      'T',
      stock_column:      'J',
      modelo_column:     'H',
      propuesta_column:  'W',
    },
    backlog: { name: 'BACKLOG', start_row: 5 },
  },
  columns_historico: {
    oc:              'OC',
    modelo:          'MODELO',
    serie:           'SERIE',
    estatus:         'ESTATUS',
    bodega:          'BODEGA',
    vendedor:        'VEND',
    cliente:         'CLIENTE',
    folio_venta:     'FOLIO',
    fecha_venta:     'FECHA DE VENTA',
    factura_venta:   'FACTURA',
    costo_venta_mx:  'COSTO VTA (MX)',
  },
  estatus_validos:   ['ALMACEN', 'SEPARADO', 'ENTREGADO', 'PENDIENTE', 'PEDIDO', 'DEVUELTO', 'DESHABILITADO'],
  bodegas_canonicas: ['FLETEROS', 'CENIZO', 'PORTEO', 'TRANE'],
  bodegas_aliases:   { FLETERO: 'FLETEROS' },
  encargados_reposicion: current.reposicion_recipients ?? [PORTAL],
};

const { error: upErr } = await sb.from('organizations').update({ inventory_excel_config: fullConfig }).eq('portal_email', PORTAL);
if (upErr) { console.error('update failed:', upErr); process.exit(1); }
console.log('\nConfig actualizado. location.itemId =', itemId, 'scope.type =', scope.type);
console.log('DONE.');
