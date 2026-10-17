import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PUBLIC_MEERKAT_ROLES, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';

// Dev-only: aplica los valores del avatar-tuner directamente al archivo
// `src/lib/portal/meerkat-roles.ts`. Vercel tiene filesystem read-only en
// prod, así que esto solo funciona corriendo localmente (`next dev`).
//
// Patchea 3 campos por meerkat:
//   avatarOffsetX, avatarOffsetY, avatarScale.
// Si no existen en el role, los inserta justo después de `imagen:`.

const FILE_PATH = resolve(process.cwd(), 'src/lib/portal/meerkat-roles.ts');

type Body = {
  roleId:         MeerkatRoleId;
  avatarOffsetX:  number;
  avatarOffsetY:  number;
  avatarScale:    number;
};

function validateBody(x: unknown): Body | string {
  if (!x || typeof x !== 'object') return 'body missing';
  const b = x as Record<string, unknown>;
  const validIds = new Set(PUBLIC_MEERKAT_ROLES.map(r => r.id));
  if (typeof b.roleId !== 'string' || !validIds.has(b.roleId as MeerkatRoleId)) {
    return `roleId "${String(b.roleId)}" no es público`;
  }
  for (const k of ['avatarOffsetX', 'avatarOffsetY'] as const) {
    if (typeof b[k] !== 'number' || Math.abs(b[k] as number) > 100) {
      return `${k} debe ser número -100..100`;
    }
  }
  if (typeof b.avatarScale !== 'number' || b.avatarScale < 0.1 || b.avatarScale > 5) {
    return 'avatarScale debe ser número 0.1-5';
  }
  return {
    roleId:        b.roleId as MeerkatRoleId,
    avatarOffsetX: b.avatarOffsetX as number,
    avatarOffsetY: b.avatarOffsetY as number,
    avatarScale:   b.avatarScale   as number,
  };
}

function patchRoleBlock(src: string, roleId: MeerkatRoleId, offsetX: number, offsetY: number, scale: number): { ok: true; next: string } | { ok: false; error: string } {
  // Alineación del padding después de `id:` varía por meerkat. Match flexible.
  const idPattern = new RegExp(`\\n\\s*id:\\s*'${roleId}',`);
  const match = idPattern.exec(src);
  if (!match) return { ok: false, error: `No encontré el bloque id: '${roleId}' en el archivo.` };
  const idx = match.index + 1;

  // Scope del bloque: desde idx hasta el próximo `\n  },` (cierre de entry).
  const blockEnd = src.indexOf('\n  },', idx);
  if (blockEnd === -1) return { ok: false, error: `No encontré el cierre del bloque de ${roleId}.` };
  const blockBefore = src.slice(0, idx);
  const block       = src.slice(idx, blockEnd);
  const blockAfter  = src.slice(blockEnd);

  const offsetXLine = `    avatarOffsetX: ${offsetX},`;
  const offsetYLine = `    avatarOffsetY: ${offsetY},`;
  const scaleLine   = `    avatarScale:   ${scale},`;

  let newBlock = block;
  const offsetXRe = /\n\s*avatarOffsetX:\s*-?[\d.]+,/;
  const offsetYRe = /\n\s*avatarOffsetY:\s*-?[\d.]+,/;
  const scaleRe   = /\n\s*avatarScale:\s*[\d.]+,/;
  const hasX = offsetXRe.test(block);
  const hasY = offsetYRe.test(block);
  const hasS = scaleRe.test(block);

  if (hasX) newBlock = newBlock.replace(offsetXRe, `\n${offsetXLine}`);
  if (hasY) newBlock = newBlock.replace(offsetYRe, `\n${offsetYLine}`);
  if (hasS) newBlock = newBlock.replace(scaleRe,   `\n${scaleLine}`);

  // Si faltan, inserto justo después de la línea `imagen:`.
  if (!hasX || !hasY || !hasS) {
    const imgRe = /(\n\s*imagen:[^\n]+\n)/;
    const m = newBlock.match(imgRe);
    if (!m) return { ok: false, error: `No encontré la línea imagen: para ${roleId}. Agrégala manualmente.` };
    const inject: string[] = [];
    if (!hasX) inject.push(offsetXLine);
    if (!hasY) inject.push(offsetYLine);
    if (!hasS) inject.push(scaleLine);
    newBlock = newBlock.replace(imgRe, (_full, imgLine) => imgLine + inject.join('\n') + '\n');
  }

  return { ok: true, next: blockBefore + newBlock + blockAfter };
}

export async function POST(req: NextRequest) {
  // Dev-only: en prod Vercel bloquea filesystem write + endpoint devuelve 403.
  // En dev local = tu máquina, no auth adicional necesaria.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Solo funciona en dev local. Vercel tiene filesystem read-only.' }, { status: 403 });
  }

  const bodyRaw = await req.json().catch(() => null);
  const parsed = validateBody(bodyRaw);
  if (typeof parsed === 'string') {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const src = await readFile(FILE_PATH, 'utf-8');
  const result = patchRoleBlock(src, parsed.roleId, parsed.avatarOffsetX, parsed.avatarOffsetY, parsed.avatarScale);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await writeFile(FILE_PATH, result.next, 'utf-8');
  return NextResponse.json({
    ok:      true,
    roleId:  parsed.roleId,
    message: `Guardado: offsetX=${parsed.avatarOffsetX} offsetY=${parsed.avatarOffsetY} scale=${parsed.avatarScale} en meerkat-roles.ts. Dev server recompila automático.`,
  });
}
