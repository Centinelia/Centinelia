import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { brandKitFromAgent } from '@/lib/brand/kit';
import type { BrandKit } from '@/lib/brand/kit';

// Pre-fetch logo and convert to a PNG base64 data URI so react-pdf never
// has to do a live network request (which often fails with Supabase redirects
// and breaks on WebP images that react-pdf can't decode).
async function logoToDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    // Supabase image transform endpoint: swap /object/ → /render/image/ and
    // request PNG so react-pdf always gets a format it can handle.
    const fetchUrl = url.includes('/storage/v1/object/')
      ? url.replace('/storage/v1/object/', '/storage/v1/render/image/') + '?format=png&quality=90&width=400'
      : url;
    const res = await fetch(fetchUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function getAgentForPdf(token: string): Promise<{
  agent: Record<string, unknown>;
  brand: BrandKit;
} | null> {
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return null;

  const supabase = createAdminClient();
  // Los campos de branding (color, secondary, footer, website, address) viven en
  // `organizations` desde e372013. Solo logo_url y phone_number siguen en voice_agents.
  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null; business_name: string; phone_number: string | null; logo_url: string | null; email_logo_url: string | null }>(token, 'id, portal_email, business_name, phone_number, logo_url, email_logo_url', supabase);

  if (!agent) return null;
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email) return null;

  const { data: org } = agent.portal_email
    ? await supabase
        .from('organizations')
        .select('email_brand_color, brand_color_secondary, email_footer_text, brand_website, brand_address')
        .eq('portal_email', agent.portal_email)
        .maybeSingle()
    : { data: null };

  const rawLogoUrl = (agent.logo_url as string | null) ?? (agent.email_logo_url as string | null) ?? null;
  const logoDataUri = await logoToDataUri(rawLogoUrl);

  const brand: BrandKit = {
    ...brandKitFromAgent(agent as Record<string, unknown>, org as Record<string, unknown> | null),
    logoUrl: logoDataUri,
  };

  return { agent: agent as Record<string, unknown>, brand };
}

export function pdfResponse(buffer: Buffer, filename: string) {
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
