// Agrega "ASIGNAR" a estatus_validos del config AC. Es el estatus inicial que
// pone Nami al registrar equipos desde factura TRANE (hasta que Camila dicta
// si pasa a ALMACEN o ENTREGADO). Decisión 2026-10-06.
import { createClient } from '@supabase/supabase-js';
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const cfg = org.inventory_excel_config;
console.log('estatus_validos actual:', cfg.estatus_validos);
if (cfg.estatus_validos.includes('ASIGNAR')) {
  console.log('Ya tiene ASIGNAR, no-op.');
  process.exit(0);
}
cfg.estatus_validos = [...cfg.estatus_validos, 'ASIGNAR'];
const { error } = await sb.from('organizations').update({ inventory_excel_config: cfg }).eq('portal_email', PORTAL);
if (error) { console.error(error); process.exit(1); }
console.log('estatus_validos nuevo:', cfg.estatus_validos);
console.log('✓ ASIGNAR agregado');
