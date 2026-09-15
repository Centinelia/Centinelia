// Verifica si la columna `docs` ya existe en centinelia_clientes.
// Simple SELECT — si la columna no existe, Postgres devuelve error 42703.
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from('centinelia_clientes')
    .select('id, rfc, docs')
    .limit(1);

  if (error) {
    if (error.message.includes('docs') || error.code === '42703') {
      console.log('Columna docs NO existe todavia. Aplicar migracion antes de E2E.');
      console.log(`Error: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  console.log(`Columna docs OK. ${data?.length ?? 0} clientes en muestra.`);
  if (data && data[0]) {
    console.log(`Ejemplo: cliente ${data[0].rfc} tiene docs = ${JSON.stringify(data[0].docs)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
