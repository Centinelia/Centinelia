// Tipos y helpers para el blog long-tail.
// Cada post es un objeto BlogPost. El contenido se estructura en secciones
// con bloques tipados para poder renderizar HTML semántico (h2, h3, p, ul,
// ol, blockquote) con anchor IDs y cross-links preservados.

export type Categoria = 'Industria' | 'Operaciones' | 'Costos' | 'Diagnóstico';

export type Block =
  | { type: 'p';     text: string }
  | { type: 'h3';    text: string; id?: string }
  | { type: 'ul';    items: string[] }
  | { type: 'ol';    items: string[] }
  | { type: 'quote'; text: string; cite?: string };

export interface Section {
  id:      string;
  heading: string;
  blocks:  Block[];
}

export interface CrossLink {
  href:  string;   // relativa (/empleados/nia) o absoluta
  label: string;
  desc?: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface BlogPost {
  slug:            string;
  titulo:          string;
  subtitulo:       string;
  categoria:       Categoria;
  autor:           string;
  datePublished:   string; // YYYY-MM-DD
  readingTime:     number; // minutos
  metaTitle:       string;
  metaDescription: string;
  keywords:        string[];
  intro:           string;
  sections:        Section[];
  faq?:            Faq[];
  crossLinks:      CrossLink[];
  cta: {
    heading: string;
    body:    string;
    button:  string;
    href:    string;
  };
}
