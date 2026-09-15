// scripts/neka-notify-dryrun.ts
//
// Dispara UN correo de recordatorio de Neka SIN pasar por el cron ni tocar la
// base de datos. Sirve para:
//   1. Verificar E2E que Resend + el template llegan a tu inbox real
//   2. Ver el correo antes de habilitar NEKA_NOTIFY_ONLY en Vercel
//   3. Probar env vars (NEKA_NOTIFY_TO, NAZRE_ADMIN_EMAIL) sin correr crons
//
// USO:
//   npx tsx scripts/neka-notify-dryrun.ts                         # tortilleria + sandbox por default
//   npx tsx scripts/neka-notify-dryrun.ts --to=otro@correo.com    # override destino
//   npx tsx scripts/neka-notify-dryrun.ts --prod                  # linkea portal prod en el correo
//   npx tsx scripts/neka-notify-dryrun.ts --ciclo=2026-10         # override ciclo mostrado
//
// Requiere en .env.local: RESEND_API_KEY (para que Resend acepte el envio).
//
// NO escribe en Supabase, NO llama Facturama. Solo el envio del correo.

import { config as dotenvConfig } from 'dotenv';
import { notifyNazreToInvoice } from '../src/lib/ops/neka-notify-nazre';
import type { CentineliaCliente } from '../src/lib/billing/centinelia-clientes';
import type { CfdiInput } from '../src/lib/invoicing/provider';

dotenvConfig({ path: '.env.local' });

function parseArgs(argv: string[]) {
  const args: { to?: string; ciclo?: string; prod: boolean } = { prod: false };
  for (const a of argv.slice(2)) {
    if (a === '--prod')          args.prod = true;
    else if (a.startsWith('--to='))    args.to = a.slice(5);
    else if (a.startsWith('--ciclo=')) args.ciclo = a.slice(8);
    else if (a === '--help' || a === '-h') {
      console.log('npx tsx scripts/neka-notify-dryrun.ts [--to=EMAIL] [--ciclo=YYYY-MM] [--prod]');
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.to) process.env.NEKA_NOTIFY_TO = args.to;

  const cliente: CentineliaCliente = {
    id:                        'dryrun-cliente',
    rfc:                       'TEN010518AL3',
    razon_social:              'Tortilleria Estrella SA de CV (DRY RUN)',
    cp:                        '66470',
    regimen_fiscal:            '601',
    uso_cfdi_default:          'G03',
    correo_facturacion:        'cliente@example.mx',
    nombre_contacto:           'Beatriz',
    activo:                    true,
    conceptos: [
      { descripcion: 'Empleado digital Nia', valor_unitario: 10000, cantidad: 1, con_iva: true },
      { descripcion: 'Jornada mensual',      valor_unitario: 1988,  cantidad: 1, con_iva: true },
    ],
    periodicidad:              'monthly',
    fecha_proxima_facturacion: '2026-09-15',
    fecha_ultima_facturacion:  null,
    metodo_pago_default:       'PPD',
    forma_pago_default:        '99',
    stripe_customer_id:        null,
    notas:                     null,
    created_at:                new Date().toISOString(),
    updated_at:                new Date().toISOString(),
  };

  const cfdi: CfdiInput = {
    emisor:          { rfc: 'AAMN951208I25', regimenFiscal: '612', nombre: 'NAZRE HASSAM MIGUEL ASSAD MORALES' },
    receptor:        { rfc: cliente.rfc, nombre: cliente.razon_social, usoCfdi: cliente.uso_cfdi_default, regimenFiscal: cliente.regimen_fiscal, domicilioFiscal: cliente.cp },
    lugarExpedicion: '64997',
    formaPago:       cliente.forma_pago_default,
    metodoPago:      cliente.metodo_pago_default,
    moneda:          'MXN',
    conceptos: [
      { claveProdServ: '81112501', claveUnidad: 'E48', cantidad: 1, descripcion: 'Empleado digital Nia', valorUnitario: 10000, importe: 10000, iva: 1600 },
      { claveProdServ: '81112501', claveUnidad: 'E48', cantidad: 1, descripcion: 'Jornada mensual',      valorUnitario: 1988,  importe: 1988,  iva: 318.08 },
    ],
    subtotal: 11988,
    iva:      1918.08,
    total:    13906.08,
    csd:            { cerPem: '', keyPem: '', noCertificado: '' },
    pacCredentials: { usuario: 'dryrun', password: 'dryrun' },
  };

  console.log('Neka dry-run — enviando correo de recordatorio a Nazre');
  console.log('  Destino:  ', process.env.NEKA_NOTIFY_TO ?? process.env.NAZRE_ADMIN_EMAIL ?? 'nazre20@gmail.com (fallback)');
  console.log('  Modo URL: ', args.prod ? 'PROD' : 'SANDBOX');
  console.log('  Ciclo:    ', args.ciclo ?? '2026-09');
  console.log('  Cliente:  ', cliente.razon_social);
  console.log('  Total:    ', `$${cfdi.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`);

  const res = await notifyNazreToInvoice({
    cliente,
    cfdi,
    cicloKey: args.ciclo ?? '2026-09',
    testMode: !args.prod,
  });

  if (!res.ok) {
    console.error(`Fallo: ${res.error ?? '(sin detalle)'}`);
    process.exit(1);
  }

  console.log(`\nOK. Enviado a ${res.to}. Revisa tu inbox.`);
}

main().catch((e) => {
  console.error('Excepcion no manejada:', e);
  process.exit(1);
});
