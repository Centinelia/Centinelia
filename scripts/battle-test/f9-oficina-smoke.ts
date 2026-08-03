/**
 * F9 smoke test: hit every /portal/{token}/oficina/* route as authenticated
 * owner and verify each returns 200 (no crashes / no 500). Uses prod so we
 * catch runtime issues (like the dropped-column bug we hit in cron).
 */
import { loadEnv } from './_env';
loadEnv();
import { createSession, PORTAL_COOKIE } from '../../src/lib/portal/auth';

const APP = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const PORTAL_EMAIL = 'studio@pneumastudio.mx';
const PORTAL_TOKEN = '8892c013-b122-4f11-a9d4-e88a04aff732';

const ROUTES = [
  '',
  '/oficina',
  '/oficina/bandeja',
  '/oficina/reportes',
  '/oficina/aprendizajes',
  '/oficina/investigacion',
  '/oficina/documentos',
  '/oficina/contratos',
  '/oficina/plantillas',
  '/oficina/tareas-programadas',
  '/oficina/juntas',
  '/oficina/onboarding',
  '/oficina/encuestas',
  '/oficina/llamadas',
  '/agentes',
  '/llamadas',
  '/configurar',
  '/usuarios',
];

async function main() {
  const cookie = await createSession(PORTAL_EMAIL);
  console.log(`Smoking ${ROUTES.length} routes on ${APP}\n`);

  const failures: string[] = [];
  for (const r of ROUTES) {
    const url = `${APP}/portal/${PORTAL_TOKEN}${r}`;
    const started = Date.now();
    let status = 0;
    try {
      const res = await fetch(url, { headers: { Cookie: `${PORTAL_COOKIE}=${cookie}` }, redirect: 'manual' });
      status = res.status;
    } catch (err) {
      console.log(`  🔴 ${r || '(root)'} → FETCH ERROR: ${err}`);
      failures.push(r);
      continue;
    }
    const ms   = Date.now() - started;
    const mark = status === 200 ? '✅' : status >= 300 && status < 400 ? '↪️' : '🔴';
    console.log(`  ${mark} ${status}  ${ms}ms  ${r || '(root)'}`);
    if (status >= 400) failures.push(r);
  }

  console.log(`\n${failures.length ? '🔴 ' + failures.length + ' failing:' : '✅ All routes returned 2xx/3xx'}`);
  failures.forEach(f => console.log('  -', f));
}
main().catch(err => { console.error(err); process.exit(1); });
