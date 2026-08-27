import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { searchTwilioNumbers } from '@/lib/vapi/provision';

// Pre-check si hay números disponibles en una lada MX antes del checkout. UI
// puede mostrar warning "esa lada no está disponible hoy, ¿aceptas otra?".
// Antes: silencioso post-pago, cliente MTY podía recibir número GDL sin aviso
// (Bug 4 en [[handoff-sesion-2026-08-26-completo]]).
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const areaCode = searchParams.get('areaCode')?.trim() ?? '';
  if (!/^\d{2,3}$/.test(areaCode)) {
    return NextResponse.json({ error: 'areaCode inválido (2-3 dígitos)' }, { status: 400 });
  }

  try {
    const candidates = await searchTwilioNumbers(areaCode);
    return NextResponse.json({
      areaCode,
      available: candidates.length > 0,
      count:     candidates.length,
    });
  } catch (err) {
    console.error('[lada-availability] search failed:', err);
    return NextResponse.json({ error: 'No se pudo consultar disponibilidad' }, { status: 502 });
  }
}
