// POST /api/portal/[token]/fichas-informativas/autotag-suggest
//
// Recibe el contenido de una ficha y devuelve sugerencias de tags del catálogo.
// Usado por el modal de nueva ficha (Fase 5.4) para mostrar chips de tags
// sugeridos antes de que el cliente confirme o modifique.
//
// Respuesta siempre 200. Si hay error interno, devuelve { tags: [] }
// (fallback graceful — el frontend maneja como "sin sugerencias").
//
// Auth: sesión de portal (cookie PORTAL_COOKIE).
// IDOR: verifica que el token pertenece al mismo portal_email de la sesión.
//
// Cobro: ninguno. El autotag es parte del setup, absorbido por Centinelia.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { autotagFicha } from '@/lib/autotag/service';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ tags: [] });
  }

  const contenido = typeof body.contenido === 'string' ? body.contenido.trim() : '';
  if (!contenido) {
    return NextResponse.json({ tags: [] });
  }

  try {
    const result = await autotagFicha(resolved.portalEmail, contenido);
    return NextResponse.json({ tags: result.tags });
  } catch {
    // Fallback graceful — sin tags no hay error visible al cliente.
    return NextResponse.json({ tags: [] });
  }
}
