'use client';

import Link from 'next/link';

type State = 'active' | 'no_fallback' | 'warning';

interface Props {
  state:          State;
  fallbackMasked: string | null;
  agentName:      string;
  configurarHref: string;
}

const COLORS: Record<State, { bg: string; border: string; text: string; icon: string }> = {
  active:      { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B', icon: '🔴' },
  no_fallback: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', icon: '🟡' },
  warning:     { bg: '#FEF9C3', border: '#EAB308', text: '#854D0E', icon: '🟡' },
};

export default function FallbackBanner({ state, fallbackMasked, agentName, configurarHref }: Props) {
  const c = COLORS[state];
  const title =
    state === 'active'      ? 'Modo Respaldo Activo'
    : state === 'no_fallback' ? 'Sin número de respaldo configurado'
    : 'Se están agotando tus minutos';

  const body =
    state === 'active'
      ? (fallbackMasked
          ? `Se agotaron los minutos de ${agentName} este ciclo. Las llamadas entrantes van a ${fallbackMasked}. Recarga minutos para reactivar ${agentName}.`
          : `Se agotaron los minutos y no hay número de respaldo. Las llamadas se están pausando.`)
      : state === 'no_fallback'
        ? `${agentName} no podrá atender llamadas cuando se agoten tus minutos. Configura un número de respaldo para no perder ventas.`
        : `Configura un número de respaldo antes de agotar minutos para que ${agentName} pueda transferir en lugar de colgarse.`;

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <span className="text-xl leading-none">{c.icon}</span>
      <div className="flex-1 flex flex-col gap-2">
        <h3 className="font-semibold text-sm" style={{ color: c.text }}>{title}</h3>
        <p className="text-sm" style={{ color: c.text }}>{body}</p>
        {state !== 'active' && (
          <Link href={configurarHref} className="text-xs underline" style={{ color: c.text }}>
            Configurar respaldo
          </Link>
        )}
      </div>
    </div>
  );
}
