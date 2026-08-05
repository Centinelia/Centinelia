'use client';

import Tabs from '@/components/portal-ui/overlays/Tabs';

interface Props {
  children: React.ReactNode[];
  /** Passed from server so pill colour can tint active tab text */
  roleColor?: string;
}

const TAB_DEFS = [
  { value: 'voz',        label: 'Personalidad y voz' },
  { value: 'knowledge',  label: 'Conocimiento y guardrails' },
  { value: 'tools',      label: 'Herramientas e integraciones' },
  { value: 'horarios',   label: 'Horarios y automatizaciones' },
  { value: 'marca',      label: 'Marca y ajustes' },
] as const;

/**
 * ConfigurarTabs
 *
 * Thin client shell that wraps the 5-tab layout for /configurar.
 * children[0..4] map to the 5 tab panels in order:
 *   0 → Personalidad y voz
 *   1 → Conocimiento y guardrails
 *   2 → Herramientas e integraciones
 *   3 → Horarios y automatizaciones
 *   4 → Marca y ajustes
 */
export default function ConfigurarTabs({ children }: Props) {
  return (
    <Tabs.Root defaultValue="voz" variant="pill">
      {/* Scrollable on mobile, static on desktop */}
      <div className="overflow-x-auto pb-1">
        <Tabs.List className="flex-nowrap whitespace-nowrap">
          {TAB_DEFS.map(t => (
            <Tabs.Trigger key={t.value} value={t.value}>
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>

      {TAB_DEFS.map((t, i) => (
        <Tabs.Content key={t.value} value={t.value} className="flex flex-col gap-5">
          {(children as React.ReactNode[])[i]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
