import './_bootstrap';
import { shouldForceBacklog } from '../src/lib/ops/inbox-processor';
const cases = [
  ['Procesa Backlog URGENTE', 'Se que no es miercoles o viernes pero porfavor actualizame el backlog Nami porfavor.'],
  ['Procesa Backlog URGENTE', 'actualiza el backlog ya'],
  ['Backlog hoy', 'aunque sea jueves procésalo'],
  ['Backlog', 'procésalo ahora aunque no sea miércoles o viernes'],
  ['Backlog', 'urgente actualiza el backlog'],
  ['Backlog', 'no quiero esperar al miércoles, hazlo'],
  // Casos NEG:
  ['Backlog', 'proceso normal, cuando toque'],
  ['Hola', 'cómo estás'],
];
for (const [s, b] of cases) {
  console.log(`${shouldForceBacklog(s, b) ? '✓ FORCE' : '✗ no force'}: subject="${s}" body="${b}"`);
}
