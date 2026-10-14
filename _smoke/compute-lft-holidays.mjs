// Compute LFT holidays 2026-2030 for the rrhh_festivos_mx_lft seed.
// Determinist script per CLAUDE.md regla 2.

function firstMondayOfMonth(y, m) {
  const d = new Date(Date.UTC(y, m - 1, 1));
  const dow = d.getUTCDay();
  const offset = (1 - dow + 7) % 7;
  d.setUTCDate(1 + offset);
  return d.toISOString().slice(0, 10);
}

function nthMondayOfMonth(y, m, n) {
  const first = firstMondayOfMonth(y, m);
  const d = new Date(first + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7 * (n - 1));
  return d.toISOString().slice(0, 10);
}

const years = [2026, 2027, 2028, 2029, 2030];
const rows = [];
for (const y of years) {
  rows.push([`${y}-01-01`, `Año Nuevo`]);
  rows.push([firstMondayOfMonth(y, 2), `Día de la Constitución (conmem. 5 feb)`]);
  rows.push([nthMondayOfMonth(y, 3, 3), `Natalicio de Benito Juárez (conmem. 21 mar)`]);
  rows.push([`${y}-05-01`, `Día del Trabajo`]);
  rows.push([`${y}-09-16`, `Día de la Independencia`]);
  rows.push([nthMondayOfMonth(y, 11, 3), `Día de la Revolución (conmem. 20 nov)`]);
  rows.push([`${y}-12-25`, `Navidad`]);
}

for (const [fecha, nombre] of rows) {
  console.log(`('${fecha}', '${nombre}'),`);
}
