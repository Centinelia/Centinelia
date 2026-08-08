'use client';

import { useEffect, useState } from 'react';
import { Gauge, ShoppingCart, BatteryCharging } from 'lucide-react';

interface Props {
  /** Content for the "Uso" tab (Minutos + Tareas usage bars) */
  usoContent:     React.ReactNode;
  /** Content for the "Comprar" tab (dynamic border/bg, buy buttons) */
  comprarContent: React.ReactNode;
  /** Content for the "Recarga" tab (auto-refill configuration) */
  recargaContent: React.ReactNode;
}

const TABS: Array<{ id: 'uso' | 'comprar' | 'recarga'; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'uso',     label: 'Uso',     icon: Gauge },
  { id: 'comprar', label: 'Comprar', icon: ShoppingCart },
  { id: 'recarga', label: 'Recarga', icon: BatteryCharging },
];

// Map URL hash (used by sidebar anchors) → tab value
function hashToTab(): 'uso' | 'comprar' | 'recarga' {
  if (typeof window === 'undefined') return 'uso';
  const h = window.location.hash.slice(1);
  if (h === 'comprar') return 'comprar';
  if (h === 'recarga') return 'recarga';
  return 'uso';
}

/**
 * CuentaUsageTabsCard
 *
 * Client shell que fusiona las 3 secciones (Uso / Comprar / Recarga) en una
 * sola Card con pill tabs. El tab activo se sincroniza con el hash de la URL
 * para que los links "Consumo" (#uso-del-mes) y "Saldo" (#comprar) del sidebar
 * abran el tab correcto.
 */
export default function CuentaUsageTabsCard({ usoContent, comprarContent, recargaContent }: Props) {
  const [value, setValue] = useState<'uso' | 'comprar' | 'recarga'>('uso');

  useEffect(() => {
    setValue(hashToTab());
    const onHash = () => setValue(hashToTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
            Consumo, compras y recarga
          </h2>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Uso del mes, compras puntuales y recarga automática.
          </p>
        </div>
      </div>
      {/* Segmented tab bar — más presencia */}
      <div className="px-5 py-3" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
        <div className="inline-flex items-center gap-1 p-1 rounded-xl w-full"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = value === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setValue(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-semibold transition-all"
                style={{
                  background: active ? '#6C3BFF' : 'transparent',
                  color:      active ? '#ffffff' : '#6B6480',
                  boxShadow:  active ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
                }}>
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-5">
        {value === 'uso'     && <div className="flex flex-col gap-4">{usoContent}</div>}
        {value === 'comprar' && <div className="flex flex-col gap-4">{comprarContent}</div>}
        {value === 'recarga' && <div className="flex flex-col gap-4">{recargaContent}</div>}
      </div>
    </div>
  );
}
