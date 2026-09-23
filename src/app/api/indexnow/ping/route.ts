import { NextResponse } from 'next/server';
import { meerkatSlugs } from '@/lib/meerkats/data';
import { industrySlugs } from '@/lib/industrias/data';
import { COMPARISONS } from '@/lib/vs/data';

// IndexNow: ping instantáneo a Bing/Yandex/Seznam/Naver cuando cambia contenido.
// Bing feeds Copilot; Yandex feeds YandexGPT. Con este endpoint, un cambio en
// producción se refleja en esos índices en minutos, no días.
//
// Uso: POST /api/indexnow/ping con Authorization: Bearer $CRON_SECRET.
// Body opcional: { "urls": ["/algo", "/otro"] }. Si no viene, se envían las
// URLs core del sitio (home + páginas dinámicas de alto valor GEO).

const BASE_URL   = 'https://www.centinelia.mx';
const HOST       = 'www.centinelia.mx';
const KEY        = 'c9e2b7d4a1f6c8e3b5d9a7f1e4c6b8d0';
const KEY_URL    = `${BASE_URL}/${KEY}.txt`;
const ENDPOINT   = 'https://api.indexnow.org/IndexNow';

interface PingRequest {
  urls?: string[];
}

function buildDefaultUrls(): string[] {
  const paths: string[] = [
    '/',
    '/empleados',
    '/industrias',
    '/vs',
    '/faq',
    '/pack-ciclo-oc-cfdi',
    '/cotizar',
    '/pedir-rol',
    '/llms.txt',
    '/llms-full.txt',
  ];

  for (const slug of meerkatSlugs())  paths.push(`/empleados/${slug}`);
  for (const slug of industrySlugs()) paths.push(`/industrias/${slug}`);
  for (const c of COMPARISONS)        paths.push(`/vs/${c.slug}`);

  const CUSTOM_INDUSTRIES = ['clinicas', 'restaurantes', 'despachos', 'inmobiliarias', 'tiendas'];
  for (const slug of CUSTOM_INDUSTRIES) paths.push(`/industrias/${slug}`);

  return paths.map(p => `${BASE_URL}${p}`);
}

function normalizeUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${p}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  // Autorización con CRON_SECRET.
  const auth   = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: PingRequest = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch { /* ignore */ }

  const urlList = (body.urls && body.urls.length > 0)
    ? body.urls.map(normalizeUrl)
    : buildDefaultUrls();

  // IndexNow limita a 10,000 URLs por request. Truncamos por seguridad.
  const trimmed = urlList.slice(0, 10_000);

  const payload = {
    host:         HOST,
    key:          KEY,
    keyLocation:  KEY_URL,
    urlList:      trimmed,
  };

  const res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body:    JSON.stringify(payload),
  });

  const status  = res.status;
  const text    = await res.text().catch(() => '');

  // 200 y 202 son éxito según la spec de IndexNow. 429 = rate limit.
  const ok = status === 200 || status === 202;
  return NextResponse.json({
    ok,
    submitted: trimmed.length,
    status,
    response:  text.slice(0, 500),
  }, { status: ok ? 200 : 502 });
}

// Permitir GET con query ?dry=1 para inspeccionar qué URLs se mandarían sin
// hacer el ping real. Útil para debugging desde el navegador.
export async function GET(req: Request): Promise<NextResponse> {
  const url  = new URL(req.url);
  const dry  = url.searchParams.get('dry') === '1';
  if (!dry) {
    return NextResponse.json({ ok: false, error: 'use POST or GET ?dry=1' }, { status: 405 });
  }
  const urls = buildDefaultUrls();
  return NextResponse.json({ ok: true, dryRun: true, urls, count: urls.length });
}
