import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Probar UUID exacto de la memoria
const UUID = '55a93750-5b23-495c-a8ba-72fcb23942d7';
const { data: byUuid } = await sb.from('facturas_repository').select('*').eq('uuid', UUID);
console.log(`── facturas_repository UUID ${UUID} ──`);
console.log('rows:', byUuid?.length ?? 0);
if (byUuid?.length) console.log(JSON.stringify(byUuid[0], null, 2));

// Mostrar columnas disponibles de facturas_repository
const { data: sample } = await sb.from('facturas_repository').select('*').limit(1);
console.log('\nfacturas_repository cols:', sample?.length ? Object.keys(sample[0]).sort() : 'empty');

// Buscar folios recientes de Centinelia (quien es Nazre como emisor con RFC personal AAMN951208I25)
const { data: folios } = await sb.from('facturas_repository')
  .select('folio, uuid, rfc_emisor, rfc_receptor, razon_social_receptor, total, fecha_timbrado, created_at')
  .ilike('rfc_emisor', '%AAMN951208I25%')
  .order('created_at', { ascending: false })
  .limit(10);
console.log('\n── Facturas con emisor RFC personal AAMN951208I25 ──');
if (folios?.length) console.table(folios);
else console.log('(sin rows)');

// Último recurso: filtra por folio=4 textual
const { data: byFolio } = await sb.from('facturas_repository')
  .select('folio, uuid, rfc_emisor, rfc_receptor, razon_social_receptor, total, fecha_timbrado, created_at')
  .or('folio.eq.4,folio.eq.4,folio.eq."4"')
  .order('created_at', { ascending: false })
  .limit(10);
console.log('\n── Folios=4 recientes ──');
if (byFolio?.length) console.table(byFolio);
