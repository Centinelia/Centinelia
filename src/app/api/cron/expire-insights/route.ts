export const dynamic = 'force-dynamic';

import { defineCron, errorMessage } from '@/lib/cron/define-cron';

// Expira insights que llevan >EXPIRE_DAYS sin acción del usuario.
// Evita el backlog contemplativo — si no lo atendiste en 2 semanas, el
// dato probablemente ya no es relevante y ocupa espacio del cap.
const EXPIRE_DAYS = 14;

export const GET = defineCron({
  name: 'expire-insights',
  handler: async ({ supabase }) => {
    const cutoff = new Date(Date.now() - EXPIRE_DAYS * 86400000).toISOString();

    const { data, error } = await supabase
      .from('agent_recommendations')
      .update({ status: 'expirada', resolved_at: new Date().toISOString() })
      .eq('status', 'nueva')
      .lt('created_at', cutoff)
      .select('id');

    if (error) {
      // El wrapper convertirá esto en status=error + alert.
      throw new Error(errorMessage(error));
    }

    const expired = (data ?? []).length;
    return {
      expected:  expired,
      processed: expired,
      metadata:  { expired },
    };
  },
});
