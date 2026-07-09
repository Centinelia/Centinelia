import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { brandKitFromAgent } from '@/lib/brand/kit';
import type { BrandKit } from '@/lib/brand/kit';

export async function getAgentForPdf(token: string): Promise<{
  agent: Record<string, unknown>;
  brand: BrandKit;
} | null> {
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return null;

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name, phone_number, logo_url, email_logo_url, email_brand_color, email_footer_text, brand_website, brand_address')
    .eq('portal_token', token)
    .single();

  if (!agent) return null;
  return { agent: agent as Record<string, unknown>, brand: brandKitFromAgent(agent as Record<string, unknown>) };
}

export function pdfResponse(buffer: Buffer, filename: string) {
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
