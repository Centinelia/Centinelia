'use client';

import { usePathname } from 'next/navigation';
import SupportChat     from './SupportChat';
import OpsAgentChatFab, { type AgentOption } from './OpsAgentChatFab';

interface Props {
  token:     string;
  opsAgents: AgentOption[];
}

/**
 * PortalChatDock — decide qué chats se muestran según ruta.
 *
 * Regla:
 * - En /oficina/* (workspace de ops): ambos chats se preservan.
 *   SupportChat left · OpsAgentChatFab right (comportamiento legacy).
 * - Fuera de /oficina (portal principal): solo SupportChat, y va a la
 *   esquina inferior derecha (donde antes vivía OpsFab). El chat con
 *   empleados no aplica en el dashboard del portal — ahí se ven cards
 *   de empleados, no interacción directa.
 */
export default function PortalChatDock({ token, opsAgents }: Props) {
  const pathname = usePathname();
  const inOficina = pathname?.includes('/oficina') ?? false;

  if (inOficina) {
    return (
      <>
        <SupportChat position="left" />
        {opsAgents.length > 0 && <OpsAgentChatFab token={token} agents={opsAgents} />}
      </>
    );
  }

  return <SupportChat position="right" />;
}
