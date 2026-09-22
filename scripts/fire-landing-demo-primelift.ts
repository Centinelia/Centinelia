/**
 * Dispara una llamada demo landing usando el contexto del último request
 * PrimeLift (c1333ea9-...). Salta el OTP flow — llama directo a
 * triggerLandingDemoCall con los datos ya validados en la BD.
 *
 * Uso: pnpm tsx scripts/fire-landing-demo-primelift.ts
 * O:   npx tsx scripts/fire-landing-demo-primelift.ts
 *
 * Requisitos:
 *   - VAPI_API_KEY en .env.local
 *   - voice_agents row con id LANDING_DEMO_AGENT_ID sincronizado con Vapi
 *   - phone number configurado en Vapi
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const CONTEXT = {
  phone:          '8112803360',
  orgName:        'PrimeLift',
  orgDescription: 'Venta y Renta de equipos de montacargas en Monterrey Nuevo León',
  expectation:    'Toma los datos de un cliente para posteriormente ofrecerle algunos modelos de montacargas para venta y renta',
  requestId:      'c1333ea9-7007-4ba5-9fef-073fa7e8249b',
};

async function main() {
  console.log('Disparando llamada demo landing con contexto:');
  console.log(JSON.stringify(CONTEXT, null, 2));
  console.log('');

  // Dynamic import DESPUES del config para que VAPI_API_KEY este seteado
  // al momento en que outbound.ts hace `process.env.VAPI_API_KEY` top-level.
  const { triggerLandingDemoCall } = await import('../src/lib/vapi/landing-demo');
  const result = await triggerLandingDemoCall(CONTEXT);

  console.log('Resultado:', JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
  console.log('');
  console.log(`Vapi call ID: ${result.vapiCallId}`);
  console.log(`El telefono +52${CONTEXT.phone} deberia recibir llamada en <30s.`);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
