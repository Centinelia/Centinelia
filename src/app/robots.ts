import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.centinelia.mx';

// Rutas privadas o de infraestructura que ningún bot debe crawlear.
// /api/public/ es la excepción explícita: catálogo read-only para LLMs.
const PRIVATE_PATHS = ['/admin/', '/api/', '/portal/', '/onboarding/', '/setup/', '/r/', '/s/', '/reporte/'];
const PUBLIC_API    = '/api/public/';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default: buscadores clásicos + resto de bots.
      // El allow más largo (/api/public/) vence al disallow (/api/) por spec.
      {
        userAgent: '*',
        allow:     ['/', PUBLIC_API],
        disallow:  PRIVATE_PATHS,
      },

      // Bots de LLM que citan la fuente. Los queremos DENTRO.
      // GPTBot = OpenAI (ChatGPT + búsqueda). ClaudeBot = Anthropic. PerplexityBot = Perplexity.
      // Google-Extended = Gemini / AI Overviews. Applebot-Extended = Apple Intelligence.
      // OAI-SearchBot = ChatGPT Search. ChatGPT-User = navegación en vivo de ChatGPT.
      // Claude-User / Claude-SearchBot = navegación en vivo de Claude.
      // PerplexityBot / Perplexity-User = citaciones en respuestas de Perplexity.
      // cohere-ai, CCBot (Common Crawl) alimentan training de múltiples LLMs.
      ...[
        'GPTBot',
        'OAI-SearchBot',
        'ChatGPT-User',
        'ClaudeBot',
        'Claude-User',
        'Claude-SearchBot',
        'PerplexityBot',
        'Perplexity-User',
        'Google-Extended',
        'Applebot-Extended',
        'cohere-ai',
        'CCBot',
        'DuckAssistBot',
        'MistralAI-User',
        'Meta-ExternalAgent',
      ].map(userAgent => ({
        userAgent,
        allow:    ['/', PUBLIC_API],
        disallow: PRIVATE_PATHS,
      })),

      // Bots que scrapean sin citar la fuente (o con historial de abuso).
      // Bytespider = ByteDance / TikTok, entrena Doubao sin atribuir.
      // Amazonbot = alimenta Alexa+ sin citación clara.
      // FriendlyCrawler, AI2Bot, ImagesiftBot: scrapers agresivos sin valor de tráfico.
      ...['Bytespider', 'Amazonbot', 'FriendlyCrawler', 'AI2Bot', 'ImagesiftBot'].map(userAgent => ({
        userAgent,
        disallow: '/',
      })),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
