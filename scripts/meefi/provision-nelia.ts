import { createClient } from '@supabase/supabase-js';

/**
 * Script de provisioning one-shot para Nelia en la organización Meefi.
 *
 * Nelia es el meerkat de Servicio al Cliente para el prospecto Meefi.
 * Este script crea la entrada en voice_agents con:
 * - portal_email: meefi-demo@centinelia.mx
 * - agent_name: Nelia
 * - role: 'Atención al cliente' (según MEERKAT_ROLES.nelia.rol)
 * - voice_id: null (chat-only para esta demo)
 *
 * El controlador ejecutará este script como:
 *   tsx scripts/meefi/provision-nelia.ts
 *
 * Después de ejecutarlo, copiar el agent_id output a .env.local:
 *   MEEFI_NELIA_AGENT_ID=<uuid-obtenido>
 *
 * Luego pushear a Vercel para que el proxy /api/demo/meefi/chat lo use.
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Confirmar que Meefi existe
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('portal_email, name')
    .eq('portal_email', 'meefi-demo@centinelia.mx')
    .single();

  if (orgErr || !org) {
    throw new Error('Organización Meefi no encontrada con portal_email=meefi-demo@centinelia.mx');
  }

  console.log(`Organización confirmada: ${org.name} (${org.portal_email})`);

  // Verificar que Nelia no exista ya
  const { data: existing, error: checkErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name')
    .eq('portal_email', 'meefi-demo@centinelia.mx')
    .eq('agent_name', 'Nelia')
    .single();

  if (!checkErr && existing) {
    console.warn(`Advertencia: Nelia ya existe con id ${existing.id}. Abortando.`);
    process.exit(0);
  }

  // Crear Nelia con los campos requeridos
  const { data: nelia, error: insertErr } = await supabase
    .from('voice_agents')
    .insert({
      // Datos básicos
      client_name:            'Meefi',
      business_name:          'Meefi',
      agent_name:             'Nelia',
      role:                   'Atención al cliente',
      portal_email:           'meefi-demo@centinelia.mx',

      // Contactos (requeridos, no nullable)
      client_email:           'meefi-demo@centinelia.mx',
      business_phone_display: '',
      phone_number:           '',
      transfer_whatsapp:      null,

      // Configuración de voz (null = chat-only)
      elevenlabs_voice_id:    null,
      vapi_agent_id:          null,

      // Plan y minutaje
      plan:                   'pro',
      jornada_type:           'combinada',
      minutes_included:       0,
      minutes_used:           0,

      // Roles y características
      features: {
        receptionist:            true,
        lead_qualification:      false,
        appointment_booking:     false,
        existing_client_support: true,
        smart_transfer:          true,
        order_taking:            false,
        multilingual:            false,
        client_memory:           false,
        outbound_calls:          true,
        outbound_capabilities:   ['seguimiento_leads', 'encuestas', 'reactivacion', 'actualizacion_estatus'],
        role_color:              '#3b82f6',
        meerkat_role_id:         'nelia',
      },

      // Configuración de demo
      active:                 true,
      timezone:               'America/Monterrey',
    })
    .select('id, agent_name, role, portal_email')
    .single();

  if (insertErr || !nelia) {
    throw new Error(`Error al insertar Nelia: ${insertErr?.message || 'sin error específico'}`);
  }

  console.log('\nNelia provisionada exitosamente:');
  console.log(`  ID: ${nelia.id}`);
  console.log(`  Nombre: ${nelia.agent_name}`);
  console.log(`  Rol: ${nelia.role}`);
  console.log(`  Portal: ${nelia.portal_email}`);
  console.log('\nProximo paso:');
  console.log(`  1. Copiar a .env.local: MEEFI_NELIA_AGENT_ID=${nelia.id}`);
  console.log(`  2. Pushear a Vercel`);
  console.log(`  3. El proxy /api/demo/meefi/chat usará este agent_id automáticamente`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
