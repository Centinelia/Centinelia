import { NextRequest, NextResponse } from 'next/server';
import { parseCommand } from '@/lib/admin/command-grammar';
import { executeCommand } from '@/lib/admin/command-actions';

export const dynamic = 'force-dynamic';

const ADMIN_COOKIE = 'Centinelia_admin';

/**
 * C2 — Command line del admin. Deterministic first.
 *
 * Recibe { input: string }. Si matchea la grammar, dispatcha directo y
 * responde con el resultado. Si no matchea, responde con error de parseo.
 * (El fallback a Claude para "chat abierto" queda para una iteración
 * posterior — el punto del principio es NO pagarle a un modelo por parsear
 * algo que es regex.)
 */
export async function POST(req: NextRequest) {
  const admin = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!admin || admin !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: { input?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 });
  }

  const input = (body.input ?? '').toString();
  if (!input.trim()) {
    return NextResponse.json({ ok: false, error: 'Comando vacío.' }, { status: 400 });
  }

  const parse = parseCommand(input);
  if (!parse.ok) {
    return NextResponse.json({
      ok:         false,
      parseError: parse.error,
      suggestion: parse.suggestion,
    });
  }

  const started = Date.now();
  try {
    const result = await executeCommand(parse.command);
    return NextResponse.json({
      ok:      result.ok,
      trace:   parse.trace,
      message: result.message,
      data:    result.data,
      ms:      Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      trace: parse.trace,
      error: `Error al ejecutar: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
