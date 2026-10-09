// Activa Nami para desbloquear el portal (active=true) pero deja ops/minutos/pool
// en 0 para que no procese nada hasta pagar Mes 1 real.
// Patrón "modo demo": active=true + pool=0 → consumeAiOp() rechaza → cero procesamiento.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const PORTAL = 'camila@acproyectos.com';

// Snapshot antes
console.log('── ANTES ──');
const { data: namiPre } = await sb.from('voice_agents')
  .select('active, ai_ops_used, ai_ops_limit, billing_status, client_paused')
  .eq('id', NAMI).single();
console.log('Nami:', namiPre);
const { data: orgPre } = await sb.from('organizations')
  .select('monthly_ops_pool, monthly_ops_used, monthly_minutes_used')
  .eq('portal_email', PORTAL).single();
console.log('Org :', orgPre);

// UPDATE voice_agents (Nami)
const { data: namiPost, error: nErr } = await sb.from('voice_agents')
  .update({
    active:         true,   // prender para que portal cargue
    client_paused:  false,
    ai_ops_used:    0,
    ai_ops_limit:   0,      // sin créditos a nivel agente
    billing_status: 'activo',
  })
  .eq('id', NAMI)
  .select('active, ai_ops_used, ai_ops_limit, billing_status, client_paused')
  .single();
if (nErr) { console.error('Nami UPDATE err:', nErr); process.exit(1); }

// UPDATE organizations (pool a 0)
const { data: orgPost, error: oErr } = await sb.from('organizations')
  .update({
    monthly_ops_pool:      0,      // sin créditos a nivel org → consumeAiOp rechaza
    monthly_ops_used:      0,
    monthly_minutes_used:  0,
  })
  .eq('portal_email', PORTAL)
  .select('monthly_ops_pool, monthly_ops_used, monthly_minutes_used')
  .single();
if (oErr) { console.error('Org UPDATE err:', oErr); process.exit(1); }

console.log('\n── DESPUÉS ──');
console.log('Nami:', namiPost);
console.log('Org :', orgPost);
console.log('\nOK. Portal https://www.centinelia.mx/portal/teyYGe8xILCa debería cargar.');
console.log('Nami NO procesará correos/chat porque monthly_ops_pool=0 → consumeAiOp rechaza.');
