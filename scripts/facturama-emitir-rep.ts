// scripts/facturama-emitir-rep.ts
//
// CLI para timbrar un Complemento de Pago (REP) vía Facturama. Usa el
// orchestrator emitirPagoFacturama para: timbrar + descargar PDF + guardar
// local + subir a Supabase Storage (opcional) + enviar por correo (opcional).
//
// USO:
//   npx tsx scripts/facturama-emitir-rep.ts --tortilleria-preset \
//     --fecha=2026-08-27T15:31:00 --no-op=1254526 --sandbox
//
//   Con envío por correo:
//   npx tsx scripts/facturama-emitir-rep.ts --tortilleria-preset \
//     --fecha=2026-08-27T15:31:00 --no-op=1254526 \
//     --email=Ramonleang@icloud.com --sandbox
//
// Env vars requeridas:
//   FACTURAMA_USER      ("centinelia")
//   FACTURAMA_PASSWORD
//   RESEND_API_KEY      (solo si usas --email)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import type { PagoInput } from '../src/lib/invoicing/provider';
import { emitirPagoFacturama } from '../src/lib/invoicing/facturama/emitir';

dotenvConfig({ path: '.env.local' });

interface CliArgs {
  config?: string;
  tortilleriaPreset: boolean;
  fecha?: string;
  numOperacion?: string;
  email?: string;
  outDir: string;
  testMode: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    tortilleriaPreset: false,
    outDir: './out-facturama',
    testMode: process.env.FACTURAMA_TEST_MODE === 'true',
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tortilleria-preset') args.tortilleriaPreset = true;
    else if (arg === '--config') args.config = argv[++i];
    else if (arg.startsWith('--fecha=')) args.fecha = arg.slice('--fecha='.length);
    else if (arg.startsWith('--no-op=')) args.numOperacion = arg.slice('--no-op='.length);
    else if (arg.startsWith('--email=')) args.email = arg.slice('--email='.length);
    else if (arg.startsWith('--out=')) args.outDir = arg.slice('--out='.length);
    else if (arg === '--sandbox') args.testMode = true;
    else if (arg === '--prod') args.testMode = false;
  }
  return args;
}

function tortilleriaPresetPago(fecha: string, numOp: string): PagoInput {
  return {
    emisor: {
      rfc: 'AAMN951208I25',
      regimenFiscal: '612',
      nombre: 'NAZRE HASSAM MIGUEL ASSAD MORALES',
    },
    receptor: {
      rfc: 'TEN010518AL3',
      nombre: 'TORTILLAS ESTRELLA DEL NORTE',
      regimenFiscal: '601',
      domicilioFiscal: '66470',
      usoCfdi: 'CP01',
    },
    lugarExpedicion: '64997',
    pago: {
      fechaPago: fecha,
      formaDePagoP: '03',
      monedaP: 'MXN',
      monto: 31294.48,
      numOperacion: numOp,
      documentosRelacionados: [{
        uuid: '5F1C5803-747F-4C1A-A03B-6BC3EF901FB2',
        monedaDR: 'MXN',
        metodoDePagoDR: 'PPD',
        numParcialidad: 1,
        impSaldoAnt: 31294.48,
        impPagado: 31294.48,
        impSaldoInsoluto: 0,
        objetoImpDR: '02',
        taxes: [{
          base: 26978,
          impuesto: '002',
          tipoFactor: 'Tasa',
          tasaOCuota: 0.16,
          importe: 4316.48,
          isRetencion: false,
        }],
      }],
    },
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

  let pago: PagoInput;
  if (args.tortilleriaPreset) {
    if (!args.fecha || !args.numOperacion) {
      console.error('--tortilleria-preset requiere --fecha=<ISO> --no-op=<numero>');
      process.exit(1);
    }
    pago = tortilleriaPresetPago(args.fecha, args.numOperacion);
  } else if (args.config) {
    const raw = readFileSync(args.config, 'utf8');
    pago = JSON.parse(raw) as PagoInput;
    pago.pacCredentials = pago.pacCredentials?.usuario ? pago.pacCredentials : {
      usuario: process.env.FACTURAMA_USER,
      password: process.env.FACTURAMA_PASSWORD,
    };
  } else {
    console.error('Debes pasar --tortilleria-preset o --config <path>');
    console.error('Ejemplo tortillería:');
    console.error('  npx tsx scripts/facturama-emitir-rep.ts --tortilleria-preset \\');
    console.error('    --fecha=2026-08-27T15:31:00 --no-op=1254526 --sandbox');
    process.exit(1);
  }

  console.log(`[facturama-emitir-rep] ambiente: ${args.testMode ? 'SANDBOX' : 'PROD'}`);
  console.log(`[facturama-emitir-rep] emisor: ${pago.emisor.rfc} → receptor: ${pago.receptor.rfc}`);
  console.log(`[facturama-emitir-rep] monto: $${pago.pago.monto.toFixed(2)} MXN`);
  console.log(`[facturama-emitir-rep] docs relacionados: ${pago.pago.documentosRelacionados.map(d => d.uuid).join(', ')}`);
  if (args.email) console.log(`[facturama-emitir-rep] enviar por correo a: ${args.email}`);
  console.log('');

  const result = await emitirPagoFacturama(pago, {
    testMode: args.testMode,
    timeoutMs: 60000,
    sendToEmail: args.email,
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

  if (args.email) {
    console.log(`  Email:        ${result.emailSent ? 'enviado' : 'FALLÓ (revisa RESEND_API_KEY)'}`);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
