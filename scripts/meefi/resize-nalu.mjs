import sharp from 'sharp';
import { copyFileSync } from 'node:fs';

const src = 'public/meerkats/nalu.png';
const backup = 'public/meerkats/nalu.backup.png';
const dst = 'public/meerkats/nalu.png';

// Backup una vez (idempotente: si ya existe backup, respeta)
try {
  copyFileSync(src, backup, 1 /* COPYFILE_EXCL */);
  console.log(`Backup: ${backup}`);
} catch (e) {
  if (e.code === 'EEXIST') {
    console.log(`Backup ya existe, restaurando desde backup antes de reescalar.`);
    copyFileSync(backup, src);
  } else {
    throw e;
  }
}

// Estrategia: scale up 1.10x luego recortar al size original, centrada.
const scale = 1.10;
const meta = await sharp(src).metadata();
const origW = meta.width;
const origH = meta.height;
const newW = Math.round(origW * scale);
const newH = Math.round(origH * scale);
const cropLeft = Math.round((newW - origW) / 2);
const cropTop = Math.round((newH - origH) / 2);

await sharp(src)
  .resize({ width: newW, height: newH, fit: 'fill' })
  .extract({ left: cropLeft, top: cropTop, width: origW, height: origH })
  .toFile(`${dst}.tmp`);

// Reemplazar
copyFileSync(`${dst}.tmp`, dst);
console.log(`Nalú re-escalada 1.10x centrada`);
console.log(`  Original: ${origW}x${origH}`);
console.log(`  Escalada intermedia: ${newW}x${newH}`);
console.log(`  Recorte final: ${origW}x${origH} (offset left=${cropLeft} top=${cropTop})`);
