import { describe, it, expect } from 'vitest';
import robots from '../robots';

describe('robots.ts', () => {
  const config = robots();
  const rules  = Array.isArray(config.rules) ? config.rules : [config.rules];

  const rulesByAgent = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) {
    const agent = rule.userAgent;
    if (typeof agent === 'string') rulesByAgent.set(agent, rule);
  }

  it('apunta a la sitemap correcta y setea el host', () => {
    expect(config.sitemap).toBe('https://www.centinelia.mx/sitemap.xml');
    expect(config.host).toBe('https://www.centinelia.mx');
  });

  it('tiene regla default (userAgent *) que permite crawl', () => {
    const wildcard = rulesByAgent.get('*');
    expect(wildcard).toBeDefined();
    expect(wildcard?.allow).toBe('/');
  });

  it.each([
    'GPTBot',              // OpenAI training + ChatGPT search
    'OAI-SearchBot',       // ChatGPT search citation crawler
    'ChatGPT-User',        // Live browsing durante conversación
    'ClaudeBot',           // Anthropic
    'Claude-User',         // Claude live browsing
    'Claude-SearchBot',    // Claude search
    'PerplexityBot',       // Perplexity citation
    'Perplexity-User',     // Perplexity live
    'Google-Extended',     // Gemini / AI Overviews
    'Applebot-Extended',   // Apple Intelligence
    'cohere-ai',           // Cohere training
    'CCBot',               // Common Crawl (alimenta múltiples LLMs)
    'DuckAssistBot',       // DuckDuckGo assistant
    'MistralAI-User',      // Mistral
    'Meta-ExternalAgent',  // Meta AI
  ])('permite explícitamente al bot LLM %s', agent => {
    const rule = rulesByAgent.get(agent);
    expect(rule, `Falta regla para ${agent}`).toBeDefined();
    expect(rule?.allow).toBe('/');
  });

  it.each([
    'Bytespider',       // ByteDance, historial de scrape sin citar
    'Amazonbot',        // Alimenta Alexa+ sin citación clara
    'FriendlyCrawler',
    'AI2Bot',
    'ImagesiftBot',
  ])('bloquea al scraper abusivo %s', agent => {
    const rule = rulesByAgent.get(agent);
    expect(rule, `Falta bloqueo para ${agent}`).toBeDefined();
    expect(rule?.disallow).toBe('/');
    // Bots bloqueados NO deben tener allow, si no la regla queda ambigua.
    expect(rule?.allow).toBeUndefined();
  });

  it('todas las rutas privadas están en disallow del wildcard y de los bots LLM permitidos', () => {
    const privatePaths = ['/admin/', '/api/', '/portal/', '/onboarding/', '/setup/', '/r/', '/s/', '/reporte/'];
    const permittedAgents = ['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];

    for (const agent of permittedAgents) {
      const rule = rulesByAgent.get(agent);
      const disallow = Array.isArray(rule?.disallow) ? rule?.disallow : [rule?.disallow];
      for (const path of privatePaths) {
        expect(disallow, `${agent} debe bloquear ${path}`).toContain(path);
      }
    }
  });
});
