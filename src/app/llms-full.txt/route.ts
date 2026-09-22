import { generateLlmsFullContent } from '@/lib/llms/full-content';

// /llms-full.txt: versión larga con todo el contenido citable concatenado.
// Los bots de LLM pueden absorber el sitio en una sola request en vez de
// crawlear 15 URLs. Contenido dinámico desde `plans.ts` (precios) para que
// nunca diverja del producto real.
//
// Se sirve como text/plain porque es Markdown pero muchos crawlers de LLM
// no aceptan text/markdown y algunos servidores lo re-negocian a HTML.

export const dynamic = 'force-static';
export const revalidate = 3600; // 1 hora, suficiente para post-deploy propagation

export async function GET(): Promise<Response> {
  const body = generateLlmsFullContent();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
