import { describe, it, expect } from 'vitest';
import { POSTS, getPostBySlug, postSlugs, postsSortedByDate } from '@/lib/blog/registry';

describe('blog data', () => {
  it('tiene al menos 10 posts publicados', () => {
    expect(POSTS.length).toBeGreaterThanOrEqual(10);
  });

  it('todos los slugs son URL-safe', () => {
    for (const slug of postSlugs()) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('no hay slugs duplicados', () => {
    expect(new Set(postSlugs()).size).toBe(POSTS.length);
  });

  it.each(POSTS)('$titulo: data mínima completa', p => {
    expect(p.titulo.length).toBeGreaterThan(15);
    expect(p.subtitulo.length).toBeGreaterThan(30);
    expect(p.metaTitle.length).toBeGreaterThan(15);
    expect(p.metaDescription.length).toBeGreaterThan(60);
    expect(p.metaDescription.length).toBeLessThan(250);
    expect(p.keywords.length).toBeGreaterThanOrEqual(3);
    expect(p.intro.length).toBeGreaterThan(80);
    expect(p.sections.length).toBeGreaterThanOrEqual(4);
    expect(p.crossLinks.length).toBeGreaterThanOrEqual(2);
    expect(p.cta.heading.length).toBeGreaterThan(10);
    expect(p.cta.button.length).toBeGreaterThan(3);
    expect(p.cta.href).toMatch(/^\//);
    expect(p.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.readingTime).toBeGreaterThanOrEqual(3);
  });

  it.each(POSTS)('$titulo: sin em-dashes', p => {
    const dump = JSON.stringify(p);
    expect(dump.includes('—'), `${p.titulo} contiene em-dash`).toBe(false);
  });

  it.each(POSTS)('$titulo: cada sección tiene id URL-safe y heading', p => {
    for (const s of p.sections) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.heading.length).toBeGreaterThan(5);
      expect(s.blocks.length).toBeGreaterThanOrEqual(1);
    }
  });

  it.each(POSTS)('$titulo: sections tienen ids únicos dentro del post', p => {
    const ids = p.sections.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('categorías esperadas están cubiertas', () => {
    const cats = new Set(POSTS.map(p => p.categoria));
    expect(cats.has('Industria')).toBe(true);
    expect(cats.has('Operaciones')).toBe(true);
    expect(cats.has('Costos')).toBe(true);
    expect(cats.has('Diagnóstico')).toBe(true);
  });

  it('todos los posts usan el autor "Equipo Centinelia"', () => {
    for (const p of POSTS) {
      expect(p.autor).toBe('Equipo Centinelia');
    }
  });

  it('cross-links no se autoreferencian', () => {
    for (const p of POSTS) {
      for (const link of p.crossLinks) {
        expect(link.href).not.toBe(`/blog/${p.slug}`);
      }
    }
  });

  it('getPostBySlug retorna correcto', () => {
    const first = POSTS[0];
    expect(getPostBySlug(first.slug)?.titulo).toBe(first.titulo);
    expect(getPostBySlug('inexistente')).toBeUndefined();
  });

  it('postsSortedByDate retorna la misma cantidad', () => {
    expect(postsSortedByDate().length).toBe(POSTS.length);
  });
});
