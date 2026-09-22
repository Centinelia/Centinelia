import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenvConfig({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1. Borrar notify_sent del cliente TEST ciclo 2026-09
  const { data: cliente } = await supabase
    .from('centinelia_clientes')
    .select('id')
    .eq('rfc', 'XAXX010101000')
    .single();

  const { count } = await supabase
    .from('centinelia_billing')
    .delete({ count: 'exact' })
    .eq('cliente_id', cliente!.id)
    .eq('tipo', 'notify_sent');
  console.log(`Borrados ${count} eventos notify_sent`);

  // 2. Reset fecha a HOY
  const { data: after } = await supabase
    .from('centinelia_clientes')
    .update({ fecha_proxima_facturacion: '2026-09-15' })
    .eq('rfc', 'XAXX010101000')
    .select('fecha_proxima_facturacion')
    .single();
  console.log('fecha_proxima_facturacion =>', after!.fecha_proxima_facturacion);
}

main().catch(e => { console.error(e); process.exit(1); });
