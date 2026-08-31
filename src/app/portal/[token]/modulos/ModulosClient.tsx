'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, Receipt, FileSignature, BarChart2, FolderOpen, PhoneOutgoing,
  LayoutTemplate, ClipboardList, CheckCircle2, AlertTriangle, ExternalLink, Loader2, Users,
  Package, Mail, Zap, Truck, Calendar, MessageCircle, Globe, DollarSign, ShoppingCart, Bot,
} from 'lucide-react';
import type { ModuleDefinition } from '@/lib/modules/catalog';

// Ampliar cuando un módulo nuevo use un icono no listado. iconName es un string
// libre en catalog.ts por decisión (evita import ciclo lib→ui), así que este
// map es el gate — si un módulo usa un icono no listado, cae a Package.
const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen, Receipt, FileSignature, BarChart2, FolderOpen, PhoneOutgoing,
  LayoutTemplate, ClipboardList, Package, Mail, Zap, Truck, Calendar,
  MessageCircle, Globe, DollarSign, ShoppingCart, Bot,
};

interface CatalogEntry extends ModuleDefinition {
  isActive:      boolean;
  setupComplete: boolean;
}

interface Props {
  token:   string;
  initial: CatalogEntry[];
}

const MEERKAT_LABEL: Record<string, string> = {
  nia:   'Nia',   noah: 'Noah',  nelia: 'Nelia',
  nala:  'Nala',  nox:  'Nox',   nico:  'Nico',
  niva:  'Niva',  nara: 'Nara',  nova:  'Nova',  naia: 'Naia',
};

export function ModulosClient({ token, initial }: Props) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(module: CatalogEntry) {
    if (saving) return;

    // Confirm explícito al DESACTIVAR: los módulos tienen side effects
    // (correo semanal, callbacks agendados, tools disponibles). Evitar clic
    // accidental que rompa el flujo del cliente.
    if (module.isActive) {
      const msg = module.deactivateWarning
        ? `Desactivar "${module.name}":\n\n${module.deactivateWarning}\n\n¿Continuar?`
        : `¿Desactivar "${module.name}"?`;
      if (!window.confirm(msg)) return;
    }

    setSaving(module.id);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/modules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ module_id: module.id, enabled: !module.isActive }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'No se pudo actualizar');
      setCatalog(prev => prev.map(m => m.id === module.id ? { ...m, isActive: !m.isActive } : m));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626' }}>
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {catalog.map(mod => (
          <ModuleCard key={mod.id} module={mod} token={token} saving={saving === mod.id} onToggle={() => toggle(mod)} />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({ module, token, saving, onToggle }: {
  module: CatalogEntry; token: string; saving: boolean; onToggle: () => void;
}) {
  const Icon = ICON_MAP[module.iconName] ?? Package;
  const isComingSoon = module.stage === 'coming_soon';
  const isBeta = module.stage === 'beta';
  const canActivate = !isComingSoon && (!module.requiresSetup || module.setupComplete);

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background:  '#ffffff',
        border:      module.isActive ? '1px solid rgba(22,163,74,0.35)' : '1px solid #E8E3F5',
        boxShadow:   '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.22)' }}
            >
              <Icon size={16} style={{ color: '#6C3BFF' }} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold tracking-tight truncate" style={{ color: '#1A0A3B' }}>{module.name}</h3>
              <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                {module.priceNote
                  ? module.priceNote
                  : module.priceMonthly
                    ? `$${module.priceMonthly.toLocaleString('es-MX')}/mes`
                    : 'Incluido en tu plan'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isBeta && !isComingSoon && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                style={{ background: 'rgba(180,83,9,0.12)', color: '#B45309' }}
              >
                Beta
              </span>
            )}
            {isComingSoon && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                style={{ background: 'rgba(107,100,128,0.15)', color: '#6B6480' }}
              >
                Próximamente
              </span>
            )}
            {module.isActive && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}
              >
                <CheckCircle2 size={10} /> Activo
              </span>
            )}
          </div>
        </div>

        <p className="text-[12px] mt-1" style={{ color: '#4B5563' }}>{module.tagline}</p>

        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <Users size={10} style={{ color: '#9B8FB5' }} />
          {module.meerkats.map(m => (
            <span
              key={m}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: '#F5F1FA', color: '#6C3BFF' }}
            >
              {MEERKAT_LABEL[m] ?? m}
            </span>
          ))}
        </div>

        <details className="mt-2 group">
          <summary className="text-[11px] font-semibold cursor-pointer list-none flex items-center gap-1" style={{ color: '#6C3BFF' }}>
            <span className="group-open:hidden">Ver qué hace ↓</span>
            <span className="hidden group-open:inline">Ocultar detalles ↑</span>
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[11px]" style={{ color: '#4B5563' }}>{module.description}</p>

            {module.capabilities.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#6B6480' }}>Capacidades</p>
                <ul className="flex flex-col gap-0.5">
                  {module.capabilities.map((c, i) => (
                    <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: '#1A0A3B' }}>
                      <span style={{ color: '#16a34a' }}>✓</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {module.outOfScope.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#6B6480' }}>No incluye</p>
                <ul className="flex flex-col gap-0.5">
                  {module.outOfScope.map((c, i) => (
                    <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: '#6B6480' }}>
                      <span>·</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {module.requirements.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#6B6480' }}>Requerimientos</p>
                <ul className="flex flex-col gap-0.5">
                  {module.requirements.map((c, i) => (
                    <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: '#1A0A3B' }}>
                      <span style={{ color: '#B45309' }}>!</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>

      <div
        className="px-4 py-3 flex items-center justify-between gap-2"
        style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {module.configPath && module.isActive && (
            <Link
              href={module.configPath.startsWith('/portal') ? module.configPath.replace('/portal', `/portal/${token}`) : `/portal/${token}${module.configPath}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold hover:opacity-80"
              style={{ color: '#6C3BFF' }}
            >
              Configurar <ExternalLink size={10} />
            </Link>
          )}
          {isComingSoon && (
            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#6B6480' }}>
              Aún no disponible para activar
            </span>
          )}
          {!isComingSoon && !canActivate && (
            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: '#B45309' }}>
              <AlertTriangle size={10} /> Requiere setup previo
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={saving || (!canActivate && !module.isActive)}
          className="text-[11px] font-semibold px-3 py-1.5 rounded transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
          style={{
            background: module.isActive ? '#ffffff'          : '#6C3BFF',
            color:      module.isActive ? '#DC2626'          : '#ffffff',
            border:     module.isActive ? '1px solid #FCA5A5' : 'none',
            cursor:     saving ? 'wait' : (!canActivate && !module.isActive ? 'not-allowed' : 'pointer'),
          }}
        >
          {saving && <Loader2 size={11} className="animate-spin" />}
          {module.isActive ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  );
}
