'use client';

import { useMemo, useState } from 'react';
import { Check, Save, AlertCircle } from 'lucide-react';
import { PUBLIC_MEERKAT_ROLES, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';

// Tuner visual para avatarOffsetX / avatarOffsetY / avatarScale.
//
// Modelo:
//  - sliders INTUITIVOS: + X = cara a la derecha. + Y = cara abajo.
//  - internamente aplica `transform: translate(X%, Y%) scale(S)`, cero
//    transform-origin tricks.
//  - avatarPosition queda SOLO para cropping (object-position), con default
//    'center 3%'. En portrait PNGs no afecta X; solo el Y crop.
//  - "Aplicar al repo" patchea `meerkat-roles.ts` vía /api/admin/avatar-tuner/apply
//    (dev-only, Vercel no permite filesystem write).

const C = {
  bg:      '#0D0520',
  surface: '#15082D',
  text:    '#ffffff',
  textSub: 'rgba(255,255,255,0.6)',
  textMute:'rgba(255,255,255,0.35)',
  border:  'rgba(255,255,255,0.1)',
  accent:  '#9B6DFF',
};

export default function AvatarTunerPage() {
  const [roleId, setRoleId] = useState<MeerkatRoleId>(PUBLIC_MEERKAT_ROLES[0].id);
  const role = useMemo(() => PUBLIC_MEERKAT_ROLES.find(r => r.id === roleId)!, [roleId]);

  const [offsetX, setOffsetX] = useState(role.avatarOffsetX ?? 0);
  const [offsetY, setOffsetY] = useState(role.avatarOffsetY ?? 0);
  const [scale,   setScale]   = useState(role.avatarScale   ?? 1);
  const [size,    setSize]    = useState(64);
  // Snapshot de lo último guardado al repo. Al mount = valores del role. Después
  // de un save exitoso, se actualiza para reflejar el estado real del archivo
  // (el import de `role` no se re-ejecuta en runtime).
  const [savedState, setSavedState] = useState({
    offsetX: role.avatarOffsetX ?? 0,
    offsetY: role.avatarOffsetY ?? 0,
    scale:   role.avatarScale   ?? 1,
  });

  const [saving,  setSaving]  = useState(false);
  const [savedOk, setSavedOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Reset cuando cambia role.
  const handleRoleChange = (newRoleId: MeerkatRoleId) => {
    const newRole = PUBLIC_MEERKAT_ROLES.find(r => r.id === newRoleId)!;
    const vals = {
      offsetX: newRole.avatarOffsetX ?? 0,
      offsetY: newRole.avatarOffsetY ?? 0,
      scale:   newRole.avatarScale   ?? 1,
    };
    setOffsetX(vals.offsetX);
    setOffsetY(vals.offsetY);
    setScale(vals.scale);
    setSavedState(vals);
    setRoleId(newRoleId);
    setSavedOk(null);
    setSaveErr(null);
  };

  const applyToRepo = async () => {
    setSaving(true); setSavedOk(null); setSaveErr(null);
    try {
      const res = await fetch('/api/admin/avatar-tuner/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId,
          avatarOffsetX: offsetX,
          avatarOffsetY: offsetY,
          avatarScale:   scale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setSavedState({ offsetX, offsetY, scale });
      setSavedOk(data.message ?? 'Aplicado al repo. El dev server debería recompilar.');
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Mismo patrón que los consumers tras el refactor: translate + scale (sin
  // transform-origin tricks). object-position queda en el default para crop.
  const AvatarPreview = ({ sz, label }: { sz: number; label: string }) => (
    <div className="flex flex-col items-center gap-2">
      <span style={{
        width: sz, height: sz, borderRadius: '50%',
        overflow: 'hidden', display: 'inline-block',
        background: `${role.color}22`,
        border: `2px solid ${role.color}55`,
      }}>
        {role.imagen && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={role.imagen}
            alt={role.nombre}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover',
              objectPosition: role.avatarPosition ?? 'center 3%',
              // Live preview = translate directo (igual que el nuevo avatarImgStyle
              // helper cuando avatarOffsetX/Y están definidos).
              transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        )}
      </span>
      <span style={{ fontSize: 11, color: C.textMute }}>{label} · {sz}px</span>
    </div>
  );

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">

        <header className="mb-8">
          <h1 className="text-2xl font-bold">Avatar tuner</h1>
          <p className="text-sm mt-1" style={{ color: C.textSub }}>
            Mueve los sliders. El preview actualiza en vivo. Da click en &quot;Aplicar al repo&quot; para patchear <code style={{ color: C.accent }}>meerkat-roles.ts</code> directamente (solo funciona en dev local).
          </p>
        </header>

        {/* Role selector */}
        <section className="mb-8">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: C.textSub }}>
            Meerkat
          </label>
          <div className="flex flex-wrap gap-2">
            {PUBLIC_MEERKAT_ROLES.map(r => {
              const active = r.id === roleId;
              return (
                <button
                  key={r.id}
                  onClick={() => handleRoleChange(r.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: active ? `${r.color}22` : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${active ? r.color : C.border}`,
                    color: active ? r.color : C.textSub,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
                  {r.nombre}
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-8 items-start">

          {/* Previews a varios tamaños */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: C.textSub }}>
              Preview en vivo
            </h2>
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 24,
            }}>
              <div className="flex flex-wrap items-end gap-6 justify-center">
                <AvatarPreview sz={size} label="Custom" />
                <AvatarPreview sz={56} label="admin/staff" />
                <AvatarPreview sz={64} label="/cotizar" />
                <AvatarPreview sz={96} label="Grande" />
                <AvatarPreview sz={128} label="XL" />
              </div>

              <div className="mt-6">
                <label className="block text-xs mb-1" style={{ color: C.textMute }}>Tamaño custom: {size}px</label>
                <input
                  type="range" min={32} max={200} step={2}
                  value={size} onChange={e => setSize(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </section>

          {/* Sliders + snippet + apply */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: C.textSub }}>
              Controles
            </h2>
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 24,
              display: 'flex', flexDirection: 'column', gap: 20,
            }}>
              {/* Offset X */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-semibold">← Mover horizontal →</label>
                  <span style={{ fontFamily: 'monospace', color: C.accent, fontSize: 13 }}>{offsetX}%</span>
                </div>
                <input
                  type="range" min={-50} max={50} step={1}
                  value={offsetX} onChange={e => setOffsetX(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <p className="text-xs mt-1" style={{ color: C.textMute }}>
                  Positivo → cara a la DERECHA. Negativo → cara a la IZQUIERDA. Directo e intuitivo.
                </p>
              </div>

              {/* Offset Y */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-semibold">↑ Mover vertical ↓</label>
                  <span style={{ fontFamily: 'monospace', color: C.accent, fontSize: 13 }}>{offsetY}%</span>
                </div>
                <input
                  type="range" min={-50} max={50} step={1}
                  value={offsetY} onChange={e => setOffsetY(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <p className="text-xs mt-1" style={{ color: C.textMute }}>
                  Positivo → cara ABAJO. Negativo → cara ARRIBA.
                </p>
              </div>

              {/* Scale */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-semibold">🔍 Zoom</label>
                  <span style={{ fontFamily: 'monospace', color: C.accent, fontSize: 13 }}>{scale.toFixed(2)}×</span>
                </div>
                <input
                  type="range" min={1} max={2.5} step={0.05}
                  value={scale} onChange={e => setScale(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <p className="text-xs mt-1" style={{ color: C.textMute }}>
                  1.0 = sin zoom. Hazla más grande cuando el personaje aparece chiquito.
                </p>
              </div>

              {/* Reset */}
              <button
                onClick={() => {
                  setOffsetX(savedState.offsetX);
                  setOffsetY(savedState.offsetY);
                  setScale(savedState.scale);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  color: C.textSub,
                  fontSize: 12,
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                Descartar cambios (volver a lo guardado)
              </button>
            </div>

            {/* Guardar directo al repo */}
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={applyToRepo}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '14px 20px', borderRadius: 12,
                  background: `linear-gradient(135deg, ${C.accent}, #C4A8FF)`,
                  border: 'none',
                  color: '#1A0A3B',
                  fontWeight: 700, fontSize: 15,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  boxShadow: '0 8px 24px rgba(155,109,255,0.3)',
                }}
              >
                <Save size={16} />
                {saving ? 'Guardando...' : `Guardar en meerkat-roles.ts`}
              </button>

              {savedOk && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: '#16a34a22', border: '1px solid #16a34a55',
                  color: '#4ade80', fontSize: 13,
                  display: 'flex', alignItems: 'start', gap: 8,
                }}>
                  <Check size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{savedOk}</span>
                </div>
              )}
              {saveErr && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: '#dc262622', border: '1px solid #dc262655',
                  color: '#fca5a5', fontSize: 13,
                  display: 'flex', alignItems: 'start', gap: 8,
                }}>
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{saveErr}</span>
                </div>
              )}
            </div>

            <div className="mt-4 text-xs" style={{ color: C.textMute }}>
              <strong style={{ color: C.textSub }}>Último guardado en el repo:</strong>{' '}
              offsetX=<code style={{ color: '#C4A8FF' }}>{savedState.offsetX}</code>, offsetY=<code style={{ color: '#C4A8FF' }}>{savedState.offsetY}</code>, scale=<code style={{ color: '#C4A8FF' }}>{savedState.scale}</code>
              {(offsetX !== savedState.offsetX || offsetY !== savedState.offsetY || scale !== savedState.scale) && (
                <span style={{ color: '#fbbf24', marginLeft: 8 }}>· cambios sin guardar</span>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
