'use client';
import { useState } from 'react';
import Image from 'next/image';
import { PUBLIC_MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

const STARS_ORDER = ['nia', 'noah', 'nala', 'nova', 'nelia', 'nox', 'neo', 'nami'] as const;

function orderedPublicRoles() {
  const stars = STARS_ORDER
    .map((id) => PUBLIC_MEERKAT_ROLES.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const rest = PUBLIC_MEERKAT_ROLES.filter((r) => !STARS_ORDER.includes(r.id as never));
  return [...stars, ...rest];
}

interface Props {
  initialVisibleCount?: number;
}

export default function Elenco({ initialVisibleCount = 8 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const all = orderedPublicRoles();
  const visible = expanded ? all : all.slice(0, initialVisibleCount);

  return (
    <section id="elenco" className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-2 text-center">
          Este es tu nuevo equipo.
        </h2>
        <p className="text-lg text-gray-600 mb-12 text-center">
          Cada empleado se especializa en su función.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {visible.map((m) => (
            <div
              key={m.id}
              data-testid="meerkat-card"
              className="bg-[#FAFBFF] rounded-xl p-6 text-center hover:shadow-lg transition"
            >
              {m.imagen && (
                <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden bg-white">
                  <Image
                    src={m.imagen}
                    alt={m.nombre}
                    width={96}
                    height={96}
                    style={{ objectFit: 'cover', objectPosition: m.avatarPosition ?? 'center 3%' }}
                  />
                </div>
              )}
              <h3 className="text-xl font-bold text-[#1A0A3B]">{m.nombre}</h3>
              <p className="text-sm text-[#6C3BFF] font-medium mt-1">{m.rol}</p>
              <p className="text-sm text-gray-600 mt-3">{m.descripcion}</p>
            </div>
          ))}
        </div>
        {!expanded && all.length > initialVisibleCount && (
          <div className="text-center mt-10">
            <button
              onClick={() => setExpanded(true)}
              className="px-6 py-3 text-[#6C3BFF] font-semibold hover:underline"
            >
              Ver todo el equipo ({all.length})
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
