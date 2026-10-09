// Prueba la tool inv_notificar_trane_registro_oc con PDF adjunto.
// Envía a nazre20@gmail.com (safe) en lugar de Isabel.
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/test-nami-correo-isabel.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const { executeAgentTool } = await import('../src/lib/tools/executor.ts');
const { data: agentRow } = await sb.from('voice_agents').select('*').eq('id', NAMI).maybeSingle();
const nameCtx = {
  agentId: NAMI, portalEmail: PORTAL, agentName: agentRow.agent_name, businessName: agentRow.business_name,
  portalToken: 'smoke', agent: agentRow, supabase: sb, channel: 'chat',
};

// PDF real de la OC que Nazre pasó (2026-10-06)
const PDF_PATH = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/OC 7119 QB.pdf';
if (!fs.existsSync(PDF_PATH)) { console.error('PDF no encontrado:', PDF_PATH); process.exit(1); }
const DUMMY_PDF_B64 = fs.readFileSync(PDF_PATH).toString('base64');
console.log(`  PDF real cargado: ${PDF_PATH} (${Math.round(fs.statSync(PDF_PATH).size / 1024)} KB)\n`);

console.log('── Prueba inv_notificar_trane_registro_oc con PDF adjunto ──\n');

// Correo tipo "Camila le pide a Nami notificar OC + solicita entrega para lunes"
console.log('── Variante 1: solo registrar (equivalente al correo 1 de los screenshots) ──');
const r1 = await executeAgentTool('inv_notificar_trane_registro_oc', {
  oc_numero:            '7119',
  attachment_base64:    DUMMY_PDF_B64,
  attachment_filename:  'OC 7119.pdf',
  destinatario_email:   'nazre20@gmail.com',  // override a tu correo safe
  enviar:               true,
}, nameCtx);
console.log('Result:', JSON.stringify(r1).slice(0, 400));

await new Promise(r => setTimeout(r, 2000));

// Variante 2: registrar + pedir entrega inmediata + bodega destino + nota custom
console.log('\n── Variante 2: con bodega + nota de entrega inmediata (correo 2) ──');
const r2 = await executeAgentTool('inv_notificar_trane_registro_oc', {
  oc_numero:            '6396',
  asunto_sufijo:        'PARA ENTREGA A BODEGA PABLO GONZALEZ 702',
  nota:                 'Me apoyas para ingresar y autorización de la OC 6396, ese equipo lo tienen para entrega inmediata, por favor, para ver si se logra programar para el lunes',
  attachment_base64:    DUMMY_PDF_B64,
  attachment_filename:  'OC 6396.pdf',
  destinatario_email:   'nazre20@gmail.com',
  enviar:               true,
}, nameCtx);
console.log('Result:', JSON.stringify(r2).slice(0, 400));

await new Promise(r => setTimeout(r, 2000));

// Variante 3: registrar + bodega + mencionar OCs pendientes
console.log('\n── Variante 3: con bodega CENIZO + agrupar con OCs pendientes (correo 3) ──');
const r3 = await executeAgentTool('inv_notificar_trane_registro_oc', {
  oc_numero:            '6994',
  asunto_sufijo:        'PARA ENTREGA CENIZO 151',
  nota:                 'Te mando nueva OC 6994 para entrega en la bodega de cenizo 151. ¿Se podría programar la entrega para el día de mañana junto con solo 2 de estos pqt? (OC 4599 line 1.1, modelo EAC180A3E0A1HY3*, AWAITING_SHIPPING)',
  attachment_base64:    DUMMY_PDF_B64,
  attachment_filename:  'OC 6994.pdf',
  destinatario_email:   'nazre20@gmail.com',
  enviar:               true,
}, nameCtx);
console.log('Result:', JSON.stringify(r3).slice(0, 400));

console.log('\n✓ 3 correos enviados a nazre20@gmail.com. Revisa tu bandeja (puede tardar 10-30 seg).');
