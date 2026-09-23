// Registro central de posts del blog. Cada post se importa desde
// `posts/<slug>.ts` para mantener el archivo por post separado y navegable.

import type { BlogPost } from './types';

import { POST as p1  } from './posts/recepcionista-humana-vs-empleado-digital';
import { POST as p2  } from './posts/costo-recepcionista-mexico-2026';
import { POST as p3  } from './posts/recepcion-clinica-dental';
import { POST as p4  } from './posts/pedidos-restaurante-24-7';
import { POST as p5  } from './posts/despacho-servicios-domicilio';
import { POST as p6  } from './posts/ciclo-oc-cfdi-constructoras';
import { POST as p7  } from './posts/facturacion-cfdi-automatizada';
import { POST as p8  } from './posts/cobranza-automatizada';
import { POST as p9  } from './posts/reactivar-clientes-inactivos';
import { POST as p10 } from './posts/7-senales-empleado-digital';

export const POSTS: BlogPost[] = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find(p => p.slug === slug);
}

export function postSlugs(): string[] {
  return POSTS.map(p => p.slug);
}

// Ordenados por fecha descendente para el hub. Como todos tienen la misma
// fecha de publicación inicial, el orden se mantiene según el registro.
export function postsSortedByDate(): BlogPost[] {
  return [...POSTS].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
}
