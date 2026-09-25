// GET /api/portal/[token]/ficha-tags
//
// Devuelve el catálogo de tags activos para mostrar en el modal de fichas.
// El frontend (TagSuggestionsChips + onboarding wizard) consume este endpoint
// para obtener los 15 slugs con sus labels en español.
//
// Auth: sesión de portal (cookie PORTAL_COOKIE).
// Datos: solo lee ficha_tags (tabla pública controlada por Centinelia).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ficha_tags')
    .select('slug, label_es, orden')
    .eq('active', true)
    .order('orden', { ascending: true });

  if (error) {
    return NextResponse.json({ error: `Error al leer catálogo de etiquetas: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    tags: (data ?? []).map(t => ({
      slug:     t.slug,
      label_es: t.label_es,
      orden:    t.orden,
    })),
  });
}
