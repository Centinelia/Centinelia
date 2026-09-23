import { describe, it, expect } from 'vitest';
import sitemap from '../sitemap';
import { meerkatSlugs } from '@/lib/meerkats/data';

const BASE = 'https://www.centinelia.mx';

describe('sitemap.ts', () => {
  const entries = sitemap();
  const urls = entries.map(e => e.url);

  it('incluye la home con priority 1.0', () => {
    const home = entries.find(e => e.url === BASE);
    expect(home).toBeDefined();
    expect(home?.priority).toBe(1.0);
  });

  it.each([
    '/empleados',
    '/pack-ciclo-oc-cfdi',
    '/registro',
    '/cotizar',
    '/pedir-rol',
    '/faq',
    '/industrias',
    '/industrias/clinicas',
    '/industrias/restaurantes',
    '/industrias/despachos',
    '/industrias/inmobiliarias',
    '/industrias/tiendas',
    '/vs',
    '/vs/bland-ai',
    '/vs/retell-ai',
    '/vs/vapi',
    '/legal',
    '/privacidad-datos',
    '/portal/login',
  ])('expone %s', path => {
    expect(urls).toContain(`${BASE}${path}`);
  });

  it('no expone rutas admin / api / privadas', () => {
    for (const url of urls) {
      expect(url).not.toMatch(/\/admin(\/|$)/);
      expect(url).not.toMatch(/\/api(\/|$)/);
      expect(url).not.toMatch(/\/onboarding(\/|$)/);
      expect(url).not.toMatch(/\/setup(\/|$)/);
    }
  });

  it('todas las URLs son absolutas y HTTPS bajo centinelia.mx', () => {
    for (const url of urls) {
      expect(url.startsWith(`${BASE}`)).toBe(true);
    }
  });

  it('todas las entries traen priority válida (0-1) y changeFrequency', () => {
    for (const entry of entries) {
      expect(entry.priority).toBeGreaterThanOrEqual(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
      expect(entry.changeFrequency).toBeDefined();
    }
  });

  it('portal/login tiene priority baja (no es contenido indexable)', () => {
    const login = entries.find(e => e.url.endsWith('/portal/login'));
    expect(login?.priority).toBeLessThanOrEqual(0.3);
  });

  it('empleados y home son las URLs con priority más alta (core catalog)', () => {
    const home       = entries.find(e => e.url === BASE);
    const empleados  = entries.find(e => e.url.endsWith('/empleados'));
    expect(home?.priority).toBeGreaterThanOrEqual(0.9);
    expect(empleados?.priority).toBeGreaterThanOrEqual(0.9);
  });

  it('no tiene URLs duplicadas', () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('incluye una entrada por cada meerkat del roster', () => {
    for (const slug of meerkatSlugs()) {
      expect(urls, `Falta /empleados/${slug} en sitemap`).toContain(`${BASE}/empleados/${slug}`);
    }
  });

  it('incluye una entrada por cada industria long-tail', async () => {
    const { industrySlugs } = await import('@/lib/industrias/data');
    for (const slug of industrySlugs()) {
      expect(urls, `Falta /industrias/${slug} en sitemap`).toContain(`${BASE}/industrias/${slug}`);
    }
  });

  it('incluye /glosario y una entrada por cada término', async () => {
    const { terminoSlugs } = await import('@/lib/glosario/data');
    expect(urls).toContain(`${BASE}/glosario`);
    for (const slug of terminoSlugs()) {
      expect(urls, `Falta /glosario/${slug} en sitemap`).toContain(`${BASE}/glosario/${slug}`);
    }
  });

  it('incluye /blog y una entrada por cada post publicado', async () => {
    const { postSlugs } = await import('@/lib/blog/registry');
    expect(urls).toContain(`${BASE}/blog`);
    for (const slug of postSlugs()) {
      expect(urls, `Falta /blog/${slug} en sitemap`).toContain(`${BASE}/blog/${slug}`);
    }
  });

  it('incluye /precios y las 3 comparativas de precio', async () => {
    const { precioSlugs } = await import('@/lib/precios/data');
    expect(urls).toContain(`${BASE}/precios`);
    for (const slug of precioSlugs()) {
      expect(urls, `Falta /precios/${slug} en sitemap`).toContain(`${BASE}/precios/${slug}`);
    }
  });

  it('incluye /soluciones y las 3 landings por dolor', async () => {
    const { solucionSlugs } = await import('@/lib/soluciones/data');
    expect(urls).toContain(`${BASE}/soluciones`);
    for (const slug of solucionSlugs()) {
      expect(urls, `Falta /soluciones/${slug} en sitemap`).toContain(`${BASE}/soluciones/${slug}`);
    }
  });

  it('incluye /calcular-ahorro', () => {
    expect(urls).toContain(`${BASE}/calcular-ahorro`);
  });
});
