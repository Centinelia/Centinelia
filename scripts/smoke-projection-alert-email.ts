// Smoke visual: renderiza el correo de pool-projection-alerts con el escenario
// Tortillería y abre el HTML. Para QA del rediseño post bug 2026-10-12.
//
// Uso: npx tsx scripts/smoke-projection-alert-email.ts

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { shell, heading, badge, infoCard, btn, sectionLabel, progressBar } from '../src/lib/email/send';

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function formatResetDateHuman(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!m) return iso;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return `${d} de ${MESES_ES[mo - 1]} de ${y}`;
}
function renderProjectionCard(p: { unit: 'min' | 'tareas'; projected: number; used: number; pool: number; planBase: number; avgPerDay: number; overshoot: number }): string {
  const label      = p.unit === 'min' ? 'Minutos' : 'Tareas';
  const unitHuman  = p.unit === 'min' ? 'min' : 'tareas';
  const usagePct   = Math.min(100, Math.round(p.used / p.planBase * 100));
  const projPct    = Math.min(100, Math.round(p.projected / p.planBase * 100));
  const barColor   = projPct >= 100 ? '#F87171' : '#FBBF24';
  const projNum    = p.projected.toLocaleString('es-MX');
  const usedNum    = p.used.toLocaleString('es-MX');
  const planNum    = p.planBase.toLocaleString('es-MX');
  const hasRollover = p.pool > p.planBase;
  const rolloverAmt = p.pool - p.planBase;
  const rolloverNote = hasRollover
    ? `<p style="color:#8C7FB8;font-size:12px;margin:6px 0 0;line-height:1.5;font-style:italic">Además cuentas con <strong style="color:#C8BEE8">${rolloverAmt.toLocaleString('es-MX')} ${unitHuman}</strong> de saldo acumulado del ciclo anterior.</p>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;border:1px solid #3D2E6A;border-radius:12px;margin-bottom:16px">
    <tr><td bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;padding:20px">
      <p style="color:#8C7FB8;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 6px">${label}</p>
      <p style="color:#F1EEFF;font-size:30px;font-weight:800;line-height:1.1;margin:0 0 2px">~${projNum} <span style="color:#C8BEE8;font-size:16px;font-weight:600">${unitHuman}</span></p>
      <p style="color:#C8BEE8;font-size:13px;margin:0 0 14px">proyectados al cierre del ciclo</p>
      ${progressBar(projPct, barColor)}
      <p style="color:#C8BEE8;font-size:12px;margin:10px 0 0;line-height:1.5">
        Van <strong style="color:#F1EEFF">${usedNum}</strong> de <strong style="color:#F1EEFF">${planNum}</strong> ${unitHuman} de tu plan (${usagePct}%) · ritmo actual ~<strong style="color:#F1EEFF">${p.avgPerDay}</strong> por día.
      </p>
      ${rolloverNote}
    </td></tr>
  </table>`;
}

// Escenario Tortillería original (pre-fix): daysSinceReset=3, "71% sobre plan"
// — este correo NO debería mandarse post-fix, pero sirve para QA visual.
const businessName = 'Tortillas Estrella';
const resetDate = '2026-11-01';
const projections = [
  // Minutos: plan base 1,000 (scale combinada); pool 2,000 porque hay rollover
  { unit: 'min' as const,    projected: 3420, used: 331,  pool: 2000, planBase: 1000, avgPerDay: 110.3, overshoot: 242 },
  // Tareas: plan base 1,300 (scale + 300 pro setup bonus); sin rollover
  { unit: 'tareas' as const, projected: 4030, used: 390,  pool: 1300, planBase: 1300, avgPerDay: 130.0, overshoot: 210 },
];

const resetHuman = formatResetDateHuman(resetDate);
const portalUrl  = 'https://www.centinelia.mx/portal/dummy?tab=cuenta#comprar';
const body = [
  heading(`Tu plan podría quedar corto este mes`, businessName),
  badge(`Tu ciclo renueva el ${resetHuman}`, '#F59E0B'),
  ...projections.map(p => renderProjectionCard(p)),
  sectionLabel('Qué puedes hacer'),
  infoCard(
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.6;margin:0 0 8px"><strong style="color:#F1EEFF">1.</strong> Comprar saldo extra: se suma al instante, no cambia tu plan.</p>` +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.6;margin:0 0 8px"><strong style="color:#F1EEFF">2.</strong> Activar recarga automática con umbral: se repone solo cuando baja del límite que tú elijas.</p>` +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.6;margin:0"><strong style="color:#F1EEFF">3.</strong> Ajustar el uso de tus empleados en la configuración.</p>`
  ),
  btn('Ver mi cuenta y recargar', portalUrl),
].join('');
const html = shell(body);

const out = join(tmpdir(), 'projection-alert-preview.html');
writeFileSync(out, html);
console.log(`HTML escrito en: ${out}`);
console.log('Abriendo en navegador...');
exec(`start "" "${out}"`);
