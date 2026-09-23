import React from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, Clock, User } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';
import { BASE_URL, breadcrumbSchema } from '@/lib/seo/schemas';
import type { BlogPost, Block } from './types';

interface Props {
  data: BlogPost;
}

const C = {
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  surface: '#FFFFFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.65)',
  textMute:'rgba(26,10,59,0.42)',
  border:  'rgba(108,59,255,0.12)',
  accent:  '#6C3BFF',
};

// Parser inline: **bold** y [texto](url) → JSX. Sin regex complejo, un
// tokenizer simple para no depender de MDX.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let buf = '';
  let key = 0;

  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = '';
    }
  };

  while (i < text.length) {
    // Link: [texto](url)
    if (text[i] === '[') {
      const closeBr = text.indexOf(']', i + 1);
      if (closeBr !== -1 && text[closeBr + 1] === '(') {
        const closeParen = text.indexOf(')', closeBr + 2);
        if (closeParen !== -1) {
          flush();
          const label = text.slice(i + 1, closeBr);
          const href  = text.slice(closeBr + 2, closeParen);
          const isInternal = href.startsWith('/');
          const isExternal = href.startsWith('http');
          if (isInternal) {
            nodes.push(
              <Link key={`${keyBase}-l-${key++}`} href={href} style={{ color: C.accent, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {label}
              </Link>
            );
          } else if (isExternal) {
            nodes.push(
              <a key={`${keyBase}-l-${key++}`} href={href} target="_blank" rel="noopener noreferrer nofollow" style={{ color: C.accent, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {label}
              </a>
            );
          } else {
            nodes.push(label);
          }
          i = closeParen + 1;
          continue;
        }
      }
    }
    // Bold: **texto**
    if (text[i] === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2);
      if (close !== -1) {
        flush();
        nodes.push(
          <strong key={`${keyBase}-b-${key++}`} style={{ color: C.text, fontWeight: 700 }}>
            {text.slice(i + 2, close)}
          </strong>
        );
        i = close + 2;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return nodes;
}

function renderBlock(block: Block, keyBase: string): React.ReactNode {
  switch (block.type) {
    case 'p':
      return (
        <p key={keyBase} style={{ fontSize: '1rem', color: C.text, lineHeight: 1.8, marginBottom: 16 }}>
          {renderInline(block.text, keyBase)}
        </p>
      );
    case 'h3':
      return (
        <h3 key={keyBase} id={block.id} className="font-bold" style={{ fontSize: '1.15rem', color: C.text, marginTop: 24, marginBottom: 12 }}>
          {block.text}
        </h3>
      );
    case 'ul':
      return (
        <ul key={keyBase} style={{ marginBottom: 16, paddingLeft: 20, listStyle: 'disc' }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ fontSize: '0.98rem', color: C.text, lineHeight: 1.75, marginBottom: 6 }}>
              {renderInline(it, `${keyBase}-li-${i}`)}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={keyBase} style={{ marginBottom: 16, paddingLeft: 22, listStyle: 'decimal' }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ fontSize: '0.98rem', color: C.text, lineHeight: 1.75, marginBottom: 6 }}>
              {renderInline(it, `${keyBase}-li-${i}`)}
            </li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote key={keyBase} style={{
          borderLeft: `3px solid ${C.accent}`,
          padding: '8px 20px', margin: '18px 0',
          background: C.bgAlt,
          borderRadius: 6,
        }}>
          <p style={{ fontSize: '1rem', color: C.text, fontStyle: 'italic', lineHeight: 1.7 }}>
            {renderInline(block.text, keyBase)}
          </p>
          {block.cite && (
            <cite style={{ fontSize: '0.85rem', color: C.textMute, display: 'block', marginTop: 6, fontStyle: 'normal' }}>
              {block.cite}
            </cite>
          )}
        </blockquote>
      );
  }
}

export default function PostPage({ data }: Props) {
  const canonical = `${BASE_URL}/blog/${data.slug}`;

  const articleSchema = {
    '@context':      'https://schema.org',
    '@type':         'Article',
    '@id':           canonical,
    headline:        data.titulo,
    description:     data.metaDescription,
    author:          { '@type': 'Organization', name: data.autor, url: BASE_URL },
    publisher:       {
      '@type': 'Organization',
      name:    'Centinelia',
      logo:    { '@type': 'ImageObject', url: `${BASE_URL}/logo-icon.png` },
    },
    datePublished:   data.datePublished,
    dateModified:    data.datePublished,
    mainEntityOfPage: canonical,
    url:             canonical,
    articleSection:  data.categoria,
    keywords:        data.keywords.join(', '),
  };

  const faqSchema = data.faq && data.faq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    mainEntity: data.faq.map(f => ({
      '@type':        'Question',
      name:           f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null;

  const breadcrumb = breadcrumbSchema([
    { name: 'Inicio', url: BASE_URL },
    { name: 'Blog',   url: `${BASE_URL}/blog` },
    { name: data.titulo, url: canonical },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <LandingNav />

      {/* Hero */}
      <section style={{ background: '#0D0520', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top, rgba(108,59,255,0.16) 0%, transparent 60%)' }} />
        <div className="max-w-3xl mx-auto px-6 relative" style={{ paddingTop: 100, paddingBottom: 60, zIndex: 1 }}>
          <Link href="/blog" className="inline-flex items-center gap-2 text-xs mb-6 transition-opacity hover:opacity-80" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <ArrowLeft size={12} /> Blog
          </Link>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {data.categoria}
          </p>
          <h1 className="font-bold leading-tight mb-4" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.8rem)', color: '#fff' }}>
            {data.titulo}
          </h1>
          <p className="mb-6" style={{ fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.7 }}>
            {data.subtitulo}
          </p>
          <div className="flex flex-wrap items-center gap-5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span className="inline-flex items-center gap-1.5">
              <User size={12} /> {data.autor}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} /> {data.readingTime} min de lectura
            </span>
            <time dateTime={data.datePublished}>{data.datePublished}</time>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section style={{ background: C.bg, padding: '48px 24px 24px' }}>
        <div className="max-w-3xl mx-auto">
          <p style={{ fontSize: '1.12rem', color: C.text, lineHeight: 1.85, fontWeight: 500 }}>
            {renderInline(data.intro, 'intro')}
          </p>
        </div>
      </section>

      {/* Tabla de contenido */}
      {data.sections.length > 3 && (
        <section style={{ background: C.bg, padding: '20px 24px 30px' }}>
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
                En este artículo
              </p>
              <ol style={{ paddingLeft: 20, listStyle: 'decimal' }}>
                {data.sections.map(s => (
                  <li key={s.id} style={{ fontSize: '0.9rem', color: C.textSub, marginBottom: 4 }}>
                    <a href={`#${s.id}`} className="transition-opacity hover:opacity-70" style={{ color: C.text }}>
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* Secciones */}
      <section style={{ background: C.bg, padding: '20px 24px 60px' }}>
        <article className="max-w-3xl mx-auto">
          {data.sections.map((s, si) => (
            <AnimatedSection key={s.id} delay={si === 0 ? 0 : 0.02}>
              <h2 id={s.id} className="font-bold" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)', color: C.text, marginTop: si === 0 ? 8 : 40, marginBottom: 18 }}>
                {s.heading}
              </h2>
              {s.blocks.map((b, bi) => renderBlock(b, `s${si}-b${bi}`))}
            </AnimatedSection>
          ))}
        </article>
      </section>

      {/* FAQ */}
      {data.faq && data.faq.length > 0 && (
        <section style={{ background: '#fff', padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
          <div className="max-w-3xl mx-auto">
            <AnimatedSection>
              <h2 id="faq" className="font-bold mb-6" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', color: C.text }}>
                Preguntas frecuentes
              </h2>
              <div className="space-y-3">
                {data.faq.map((f, i) => (
                  <details key={i} className="rounded-2xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                    <summary className="cursor-pointer font-semibold px-5 py-4" style={{ color: C.text, fontSize: '0.95rem', listStyle: 'none' }}>
                      {f.q}
                    </summary>
                    <div className="px-5 pb-5 text-sm leading-relaxed" style={{ color: C.textSub }}>
                      {renderInline(f.a, `faq-${i}`)}
                    </div>
                  </details>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>
      )}

      {/* Cross-links (relacionados) */}
      {data.crossLinks.length > 0 && (
        <section style={{ background: C.bg, padding: '60px 24px', borderTop: `1px solid ${C.border}` }}>
          <div className="max-w-4xl mx-auto">
            <AnimatedSection>
              <h2 className="font-bold mb-6" style={{ fontSize: 'clamp(1.3rem, 2.3vw, 1.7rem)', color: C.text }}>
                Sigue leyendo
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.crossLinks.map(l => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="block rounded-2xl p-5 transition-all hover:scale-[1.02] hover:shadow-md"
                    style={{ background: '#fff', border: `1px solid ${C.border}` }}
                  >
                    <p className="font-semibold" style={{ color: C.text, fontSize: '0.98rem', marginBottom: 4 }}>{l.label}</p>
                    {l.desc && (
                      <p style={{ fontSize: '0.85rem', color: C.textSub, lineHeight: 1.55 }}>{l.desc}</p>
                    )}
                  </Link>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>
      )}

      {/* CTA */}
      <section style={{ background: '#0D0520', padding: '80px 24px' }}>
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="font-bold mb-4" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', color: '#fff', lineHeight: 1.2 }}>
              {data.cta.heading}
            </h2>
            <p className="mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1rem', lineHeight: 1.65 }}>
              {data.cta.body}
            </p>
            <Link
              href={data.cta.href}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
            >
              {data.cta.button} <ArrowRight size={15} />
            </Link>
          </AnimatedSection>
        </div>
      </section>

      <IndustryFooter />
    </>
  );
}
