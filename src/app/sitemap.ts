import type { MetadataRoute } from 'next';
import { meerkatSlugs } from '@/lib/meerkats/data';
import { industrySlugs } from '@/lib/industrias/data';
import { terminoSlugs } from '@/lib/glosario/data';

const BASE_URL = 'https://www.centinelia.mx';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Páginas individuales por meerkat, generadas dinámicamente desde la data.
  const meerkatEntries: MetadataRoute.Sitemap = meerkatSlugs().map(slug => ({
    url:             `${BASE_URL}/empleados/${slug}`,
    priority:        0.75,
    changeFrequency: 'monthly' as const,
  }));

  // Industrias long-tail generadas dinámicamente. Las 5 industrias custom
  // (clinicas, restaurantes, despachos, inmobiliarias, tiendas) siguen en
  // el bloque estático abajo.
  const industryEntries: MetadataRoute.Sitemap = industrySlugs().map(slug => ({
    url:             `${BASE_URL}/industrias/${slug}`,
    priority:        0.75,
    changeFrequency: 'monthly' as const,
  }));

  // Glosario: definiciones canónicas para citaciones LLM.
  const glosarioEntries: MetadataRoute.Sitemap = terminoSlugs().map(slug => ({
    url:             `${BASE_URL}/glosario/${slug}`,
    priority:        0.6,
    changeFrequency: 'monthly' as const,
  }));

  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL,                              priority: 1.0, changeFrequency: 'weekly'  },

    // Producto / catálogo
    { url: `${BASE_URL}/empleados`,               priority: 0.9, changeFrequency: 'weekly'  },
    ...meerkatEntries,
    { url: `${BASE_URL}/pack-ciclo-oc-cfdi`,      priority: 0.7, changeFrequency: 'monthly' },

    // Conversión
    { url: `${BASE_URL}/registro`,                priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/cotizar`,                 priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/pedir-rol`,               priority: 0.5, changeFrequency: 'monthly' },

    // Discovery
    { url: `${BASE_URL}/faq`,                     priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/glosario`,                priority: 0.7, changeFrequency: 'monthly' },
    ...glosarioEntries,

    // Industrias
    { url: `${BASE_URL}/industrias`,              priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/industrias/clinicas`,     priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/industrias/restaurantes`, priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/industrias/despachos`,    priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/industrias/inmobiliarias`,priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/industrias/tiendas`,      priority: 0.8, changeFrequency: 'monthly' },
    ...industryEntries,

    // Comparaciones vs competidores (alto valor GEO/AEO)
    { url: `${BASE_URL}/vs`,                      priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/vs/bland-ai`,             priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/vs/retell-ai`,            priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/vs/vapi`,                 priority: 0.7, changeFrequency: 'monthly' },

    // Legal / privacidad
    { url: `${BASE_URL}/legal`,                   priority: 0.3, changeFrequency: 'yearly'  },
    { url: `${BASE_URL}/privacidad-datos`,        priority: 0.3, changeFrequency: 'yearly'  },

    // Portal (bajo priority, público pero no indexable por contenido)
    { url: `${BASE_URL}/portal/login`,            priority: 0.3, changeFrequency: 'yearly'  },
  ];

  return entries.map(e => ({ ...e, lastModified: now }));
}
