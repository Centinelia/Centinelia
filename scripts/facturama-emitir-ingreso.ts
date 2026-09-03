// scripts/facturama-emitir-ingreso.ts
//
// CLI para timbrar un CFDI 4.0 tipo Ingreso vía Facturama. Complementa a
// facturama-emitir-rep.ts. Juntos cierran el ciclo mensual Centinelia:
//   1) Emitir CFDI Ingreso PPD (este script)
//   2) Cliente paga SPEI
//   3) Emitir REP referenciando el UUID (facturama-emitir-rep.ts)
//
// USO:
//   npx tsx scripts/facturama-emitir-ingreso.ts --centinelia-preset \
//     --rfc-receptor=TEN010518AL3 --nombre-receptor="TORTILLAS ESTRELLA DEL NORTE" \
//     --cp-receptor=66470 --regimen-receptor=601 \
//     --empleado="Noah" --empleado-monto=14990 \
//     --jornada="Alta Demanda (2,000 min + 20 tareas) Mes 1" --jornada-monto=11988 \
//     --email=Ramonleang@icloud.com --sandbox
//
// Env vars: FACTURAMA_USER, FACTURAMA_PASSWORD, (RESEND_API_KEY si usas --email)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import type { CfdiInput } from '../src/lib/invoicing/provider';
import { emitirIngresoFacturama } from '../src/lib/invoicing/facturama/emitir';

dotenvConfig({ path: '.env.local' });

interface CliArgs {
  config?: string;
  centineliaPreset: boolean;
  rfcReceptor?: string;
  nombreReceptor?: string;
  cpReceptor?: string;
  regimenReceptor?: string;
  usoCfdi: string;
  empleado?: string;
  empleadoMonto?: number;
  jornada?: string;
  jornadaMonto?: number;
  emailReceptor?: string;
  outDir: string;
  testMode: boolean;
  formaPago: string;
  metodoPago: 'PUE' | 'PPD';
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    centineliaPreset: false,
    usoCfdi: 'G03',
    outDir: './out-facturama',
    testMode: process.env.FACTURAMA_TEST_MODE === 'true',
    formaPago: '99',
    metodoPago: 'PPD',
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--centinelia-preset') args.centineliaPreset = true;
    else if (arg === '--config') args.config = argv[++i];
    else if (arg.startsWith('--rfc-receptor=')) args.rfcReceptor = arg.slice('--rfc-receptor='.length);
    else if (arg.startsWith('--nombre-receptor=')) args.nombreReceptor = arg.slice('--nombre-receptor='.length);
    else if (arg.startsWith('--cp-receptor=')) args.cpReceptor = arg.slice('--cp-receptor='.length);
    else if (arg.startsWith('--regimen-receptor=')) args.regimenReceptor = arg.slice('--regimen-receptor='.length);
    else if (arg.startsWith('--uso-cfdi=')) args.usoCfdi = arg.slice('--uso-cfdi='.length);
    else if (arg.startsWith('--empleado=')) args.empleado = arg.slice('--empleado='.length);
    else if (arg.startsWith('--empleado-monto=')) args.empleadoMonto = Number(arg.slice('--empleado-monto='.length));
    else if (arg.startsWith('--jornada=')) args.jornada = arg.slice('--jornada='.length);
    else if (arg.startsWith('--jornada-monto=')) args.jornadaMonto = Number(arg.slice('--jornada-monto='.length));
    else if (arg.startsWith('--email=')) args.emailReceptor = arg.slice('--email='.length);
    else if (arg.startsWith('--out=')) args.outDir = arg.slice('--out='.length);
    else if (arg === '--sandbox') args.testMode = true;
    else if (arg === '--prod') args.testMode = false;
    else if (arg.startsWith('--forma-pago=')) args.formaPago = arg.slice('--forma-pago='.length);
    else if (arg === '--pue') args.metodoPago = 'PUE';
    else if (arg === '--ppd') args.metodoPago = 'PPD';
  }
  return args;
}

function centineliaSuscripcionPreset(args: CliArgs): CfdiInput {
  const missing: string[] = [];
  if (!args.rfcReceptor) missing.push('--rfc-receptor');
  if (!args.nombreReceptor) missing.push('--nombre-receptor');
  if (!args.cpReceptor) missing.push('--cp-receptor');
  if (missing.length > 0) {
    console.error(`--centinelia-preset requiere: ${missing.join(', ')}`);
    process.exit(1);
  }

  const conceptos: CfdiInput['conceptos'] = [];

  if (args.empleado && args.empleadoMonto) {
    const importe = args.empleadoMonto;
    conceptos.push({
      claveProdServ: '81112501',
      claveUnidad: 'E48',
      cantidad: 1,
      descripcion: `Contratación Empleado Centinelia (${args.empleado}) - Recepcionista virtual y atención al cliente`,
      valorUnitario: importe,
      importe,
      iva: +(importe * 0.16).toFixed(2),
    });
  }

  if (args.jornada && args.jornadaMonto) {
    const importe = args.jornadaMonto;
    conceptos.push({
      claveProdServ: '81112501',
      claveUnidad: 'E48',
      cantidad: 1,
      descripcion: `Jornada ${args.jornada}`,
      valorUnitario: importe,
      importe,
      iva: +(importe * 0.16).toFixed(2),
    });
  }

  if (conceptos.length === 0) {
    console.error('--centinelia-preset requiere al menos --empleado + --empleado-monto o --jornada + --jornada-monto');
    process.exit(1);
  }

  const subtotal = +conceptos.reduce((s, c) => s + c.importe, 0).toFixed(2);
  const iva = +conceptos.reduce((s, c) => s + (c.iva ?? 0), 0).toFixed(2);
  const total = +(subtotal + iva).toFixed(2);

  return {
    emisor: {
      rfc: 'AAMN951208I25',
      regimenFiscal: '612',
      nombre: 'NAZRE HASSAM MIGUEL ASSAD MORALES',
    },
    receptor: {
      rfc: args.rfcReceptor!,
      nombre: args.nombreReceptor!,
      usoCfdi: args.usoCfdi,
      regimenFiscal: args.regimenReceptor ?? '601',
      domicilioFiscal: args.cpReceptor!,
    },
    lugarExpedicion: '64997',
    formaPago: args.formaPago,
    metodoPago: args.metodoPago,
    moneda: 'MXN',
    conceptos,
    subtotal,
    iva,
    total,
    csd: { cerPem: '', keyPem: '', noCertificado: '' },
    pacCredentials: {
      usuario: process.env.FACTURAMA_USER ?? '',
      password: process.env.FACTURAMA_PASSWORD ?? '',
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.FACTURAMA_USER || !process.env.FACTURAMA_PASSWORD) {
    console.error('Faltan env vars FACTURAMA_USER / FACTURAMA_PASSWORD en .env.local');
    process.exit(1);
  }

  let cfdi: CfdiInput;
  if (args.centineliaPreset) {
    cfdi = centineliaSuscripcionPreset(args);
  } else if (args.config) {
    const raw = readFileSync(args.config, 'utf8');
    cfdi = JSON.parse(raw) as CfdiInput;
    cfdi.pacCredentials = cfdi.pacCredentials?.usuario ? cfdi.pacCredentials : {
      usuario: process.env.FACTURAMA_USER,
      password: process.env.FACTURAMA_PASSWORD,
    };
  } else {
    console.error('Debes pasar --centinelia-preset (con args) o --config <path.json>');
    console.error('');
    console.error('Ejemplo — replicar la factura de Beatriz de hoy (Tortillería $31,294.48):');
    console.error('  npx tsx scripts/facturama-emitir-ingreso.ts --centinelia-preset \\');
    console.error('    --rfc-receptor=TEN010518AL3 --nombre-receptor="TORTILLAS ESTRELLA DEL NORTE" \\');
    console.error('    --cp-receptor=66470 --regimen-receptor=601 \\');
    console.error('    --empleado="Noah" --empleado-monto=14990 \\');
    console.error('    --jornada="Alta Demanda (2,000 min + 20 tareas) Mes 1" --jornada-monto=11988 \\');
    console.error('    --sandbox');
    process.exit(1);
  }

  console.log(`[facturama-emitir-ingreso] ambiente: ${args.testMode ? 'SANDBOX' : 'PROD'}`);
  console.log(`[facturama-emitir-ingreso] emisor: ${cfdi.emisor.rfc} → receptor: ${cfdi.receptor.rfc}`);
  console.log(`[facturama-emitir-ingreso] conceptos: ${cfdi.conceptos.length}`);
  cfdi.conceptos.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.descripcion} — $${c.valorUnitario.toFixed(2)}${c.iva ? ` (+ IVA $${c.iva.toFixed(2)})` : ''}`);
  });
  console.log(`[facturama-emitir-ingreso] subtotal: $${cfdi.subtotal.toFixed(2)} | IVA: $${cfdi.iva.toFixed(2)} | TOTAL: $${cfdi.total.toFixed(2)}`);
  console.log(`[facturama-emitir-ingreso] método pago: ${cfdi.metodoPago} | forma pago: ${cfdi.formaPago} | uso CFDI: ${cfdi.receptor.usoCfdi}`);
  if (args.emailReceptor) console.log(`[facturama-emitir-ingreso] enviar por correo a: ${args.emailReceptor}`);
  console.log('');

  const result = await emitirIngresoFacturama(cfdi, {
    testMode: args.testMode,
    timeoutMs: 60000,
    sendToEmail: args.emailReceptor,
  });

  if (!result.ok) {
    console.error(`FAIL: [${result.code}] ${result.message}`);
    if (result.retryable) console.error('(retryable — puedes reintentar)');
    process.exit(1);
  }

  console.log('OK');
  console.log(`  UUID:         ${result.uuid}`);
  console.log(`  Fecha:        ${result.fechaTimbrado}`);
  console.log(`  Cert SAT:     ${result.certificadoSat}`);
  console.log(`  Sello SAT:    ${result.selloSat.slice(0, 32)}...`);

  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true });
  const xmlPath = join(args.outDir, `${result.uuid}.xml`);
  const qrPath = join(args.outDir, `${result.uuid}.qr.png`);
  writeFileSync(xmlPath, result.xml);
  writeFileSync(qrPath, result.qr);
  console.log(`  XML:          ${xmlPath}`);
  console.log(`  QR:           ${qrPath}`);

  if (result.pdf) {
    const pdfPath = join(args.outDir, `${result.uuid}.pdf`);
    writeFileSync(pdfPath, result.pdf);
    console.log(`  PDF:          ${pdfPath}`);
  } else {
    console.log(`  PDF:          (no descargado)`);
  }

  if (args.emailReceptor) {
    console.log(`  Email:        ${result.emailSent ? 'enviado' : 'FALLÓ (revisa RESEND_API_KEY)'}`);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
