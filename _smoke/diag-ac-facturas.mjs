import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Buscar facturas de Centinelia a AC Proyectos (RFC receptor AAP010601S21)
const { data: f1 } = await sb.from('facturas_repository')
  .select('*')
  .ilike('rfc_receptor', '%AAP010601S21%')
  .order('created_at', { ascending: false })
  .limit(20);
console.log('── facturas_repository → RFC AAP010601S21 ──');
if (f1?.length) {
  const cols = ['folio', 'uuid', 'rfc_receptor', 'razon_social_receptor', 'total', 'fecha_timbrado', 'created_at', 'tipo_cfdi', 'metodo_pago', 'forma_pago'];
  console.table(f1.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))));
} else {
  console.log('(sin rows en facturas_repository con ese RFC)');
}

// También buscar en cfdi_timbrados por si otra tabla
const tables = ['invoices', 'cfdi_timbrados', 'facturas', 'facturacion'];
for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  if (!error) {
    console.log(`\nTabla ${t} existe (cols sample): ${data?.length ? Object.keys(data[0]).sort().slice(0, 15).join(', ') : 'empty'}`);
    const { data: hits } = await sb.from(t).select('*').or('rfc_receptor.ilike.%AAP010601S21%,razon_social_receptor.ilike.%AIRE ACONDICIONADO PROYECTOS%,client_name.ilike.%AC Proyect%').limit(10);
    if (hits?.length) {
      console.log(`  hits en ${t}:`, hits.length);
      console.table(hits.slice(0, 5));
    }
  }
}
