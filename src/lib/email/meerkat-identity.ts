import { MEERKAT_MAP, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';
import type { MeerkatIdentity } from './send';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

const DEFAULT_ACCENT = '#6C3BFF';

// Construye la identidad visual del meerkat que aparece como header en los correos.
// Si el voice_agent tiene meerkat_role_id conocido, usa el color + imagen oficial
// del rol. Si no, fallback a monograma con inicial + color Centinelia.
export function resolveMeerkatFromAgent(agent: {
  agent_name:    string | null;
  business_name?: string | null;
  features:      Record<string, unknown> | null | undefined;
}): MeerkatIdentity {
  const rawRoleId = (agent.features && (agent.features.meerkat_role_id as string | null | undefined)) ?? null;
  const role = rawRoleId ? MEERKAT_MAP[rawRoleId as MeerkatRoleId] : null;

  if (role && role.id !== 'custom') {
    return {
      roleId:   role.id,
      name:     agent.agent_name?.trim() || role.nombre,
      role:     `Empleado digital · ${role.rol}`,
      color:    role.color,
      imageUrl: `${BASE_URL}/meerkats/${role.id}.png`,
    };
  }

  return {
    roleId:   null,
    name:     agent.agent_name?.trim() || 'Centinelia',
    role:     'Empleado digital',
    color:    DEFAULT_ACCENT,
    imageUrl: null,
  };
}

// Variante para casos donde solo tenemos nombre y (opcional) roleId — usada por
// los digests que ya resolvieron el rol desde el caller.
export function meerkatFromRoleId(agentName: string | null, roleId: string | null): MeerkatIdentity {
  return resolveMeerkatFromAgent({
    agent_name: agentName,
    features:   roleId ? { meerkat_role_id: roleId } : null,
  });
}
