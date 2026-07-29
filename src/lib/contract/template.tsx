import { PLAN_LABELS } from '@/types/agent';
import type { VoiceAgent, AgentFeatures } from '@/types/agent';
import { MINUTES_TIER_CONFIG, MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { MinutesTier } from '@/lib/billing/plans';

function fmt(date: string) {
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

const BASE_CAPABILITIES = [
  'Disponibilidad 24/7 sin interrupciones',
  'Grabaciones y transcripciones de cada interacción',
  'Portal de reportes, estadísticas y actividad en tiempo real',
  'Notificaciones al equipo por correo electrónico y WhatsApp',
  'Aprendizaje continuo supervisado por el administrador',
  'Check-in automático con reporte programable',
  'Metas medibles con seguimiento activo en cada conversación',
  'Límites de autoridad y reglas de escalación configurables',
  'Personalización de nombre, voz y personalidad del empleado',
  'Sub-usuarios del portal con permisos granulares por módulo',
  'Soporte técnico por WhatsApp y correo (hasta 24 h hábiles)',
];

const DYNAMIC_LABELS: Partial<Record<keyof AgentFeatures, string>> = {
  receptionist:            'Recepcionista — atención general e información del negocio',
  lead_qualification:      'Calificación y captura de prospectos',
  appointment_booking:     'Agendamiento, modificación y cancelación de citas',
  existing_client_support: 'Atención a clientes existentes con consulta de historial',
  smart_transfer:          'Transferencia inteligente a miembro del equipo humano',
  order_taking:            'Toma y registro de pedidos',
  multilingual:            'Atención en español e inglés de forma automática',
  client_memory:           'Memoria persistente de cliente entre sesiones',
  outbound_calls:          'Llamadas salientes desde el portal',
  helpdesk:                'Mesa de ayuda IT: tickets, incidentes y directorio',
  is_coordinator:          'Coordinación de equipos y delegación entre empleados digitales',
};

export function ContractDocument({ agent }: { agent: VoiceAgent }) {
  const features        = agent.features ?? {};
  const planLabel       = PLAN_LABELS[agent.plan] ?? agent.plan;
  const tierCfg         = agent.minutes_plan ? MINUTES_TIER_CONFIG[agent.minutes_plan as MinutesTier] : null;
  const monthlyCfg      = (agent.plan && agent.minutes_plan)
    ? MONTHLY_CONFIG[agent.plan as 'pro']?.[agent.minutes_plan as MinutesTier]
    : null;
  const monthlyPrice    = monthlyCfg?.mxn ?? 0;
  const minutesIncluded = agent.minutes_included ?? (tierCfg?.minutes ?? 0);
  const signedAt        = agent.contract_accepted_at ? fmt(agent.contract_accepted_at) : null;
  const today           = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const dynamicIncluded = (Object.entries(features) as [keyof AgentFeatures, unknown][])
    .filter(([k, v]) => v && DYNAMIC_LABELS[k])
    .map(([k]) => DYNAMIC_LABELS[k] as string);

  const dynamicExcluded = (Object.entries(features) as [keyof AgentFeatures, unknown][])
    .filter(([k, v]) => !v && DYNAMIC_LABELS[k])
    .map(([k]) => DYNAMIC_LABELS[k] as string);

  const allIncluded = [...BASE_CAPABILITIES, ...dynamicIncluded];

  // Clause numbering shifts if there are excluded services
  const n = (base: number) => `${dynamicExcluded.length > 0 ? base : base - 1}`;

  if (agent.contract_text) {
    return (
      <div style={{ fontFamily: 'Georgia, serif', lineHeight: 1.7, color: 'inherit' }}>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.875rem', margin: 0 }}>
          {agent.contract_text}
        </pre>
        {signedAt && <SignatureBlock name={agent.client_name} date={signedAt} ip={agent.contract_ip} />}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', lineHeight: 1.7, color: 'inherit', fontSize: '0.875rem' }}>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Contrato de Prestación de Servicios
        </div>
        <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.55 }}>Centinelia · Pneuma Studio</div>
      </div>

      <Clause title="1. PARTES">
        <p>
          <strong>Prestador de servicios:</strong> Pneuma Studio, desarrollador de la plataforma Centinelia, en
          adelante &ldquo;Centinelia&rdquo;.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <strong>Cliente:</strong> {agent.business_name}, representado por {agent.client_name}, en
          adelante &ldquo;el Cliente&rdquo;.
        </p>
      </Clause>

      <Clause title="2. OBJETO DEL CONTRATO">
        <p>
          Centinelia se compromete a poner a disposición del Cliente uno o más empleados digitales de inteligencia
          artificial bajo el plan <strong>{planLabel}</strong>, configurados específicamente para la
          organización <strong>{agent.business_name}</strong>.{' '}
          {agent.phone_number
            ? `Los empleados operarán en el número telefónico asignado (${agent.phone_number}) y ejecutarán las funciones descritas en la Cláusula 3, disponibles 24/7 de forma autónoma.`
            : 'Los empleados ejecutarán las funciones descritas en la Cláusula 3, disponibles 24/7 de forma autónoma.'}
        </p>
      </Clause>

      <Clause title="3. SERVICIOS INCLUIDOS">
        <p>El plan <strong>{planLabel}</strong> incluye los siguientes servicios y capacidades:</p>
        <ul style={{ marginTop: '0.5rem', paddingLeft: 0, listStyle: 'none' }}>
          {allIncluded.map(s => (
            <li key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.3rem' }}>
              <span style={{ color: '#16a34a', flexShrink: 0, fontWeight: 700, lineHeight: 1.6 }}>✓</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.7 }}>
          El plan incluye <strong>{minutesIncluded} minutos mensuales</strong> de conversación. Los minutos no
          utilizados se acumulan al mes siguiente con un límite de un mes adicional de tu plan.
        </p>
      </Clause>

      {dynamicExcluded.length > 0 && (
        <Clause title="4. SERVICIOS NO INCLUIDOS">
          <p>
            Los siguientes servicios <strong>no están incluidos</strong> en el plan contratado y requieren una
            actualización de plan para ser habilitados:
          </p>
          <ul style={{ marginTop: '0.5rem', paddingLeft: 0, listStyle: 'none' }}>
            {dynamicExcluded.map(s => (
              <li key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.3rem' }}>
                <span style={{ color: '#dc2626', flexShrink: 0, fontWeight: 700, lineHeight: 1.6 }}>✗</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Clause>
      )}

      <Clause title={`${n(5)}. FACTURACIÓN`}>
        <p>
          La mensualidad del servicio es de{' '}
          <strong>${monthlyPrice > 0 ? monthlyPrice.toLocaleString('es-MX') : '___'} MXN + IVA</strong> por mes,
          correspondiente al plan <strong>{tierCfg?.label ?? agent.minutes_plan ?? planLabel}</strong>{' '}
          ({minutesIncluded} min/mes). El cobro se realiza de forma automática a través de Stripe en la fecha de
          renovación mensual.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          En caso de fallo en el pago, el Cliente recibirá notificación y contará con un período de gracia de 3
          días naturales para regularizar antes de que el servicio sea pausado. El servicio se reanuda al
          actualizar el método de pago.
        </p>
      </Clause>

      <Clause title={`${n(6)}. DURACIÓN Y TERMINACIÓN`}>
        <p>
          El contrato tiene vigencia mensual con renovación automática. Para cancelar, el Cliente deberá
          contactar a Centinelia con al menos 5 días naturales de anticipación a la fecha de renovación.
          No se realizan reembolsos por períodos parciales.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          Si el servicio permanece pausado por más de 3 meses consecutivos sin regularizar, Centinelia se
          reserva el derecho de reasignar el número telefónico asignado, notificando al Cliente con al menos
          15 días naturales de anticipación.
        </p>
      </Clause>

      <Clause title={`${n(7)}. LIMITACIONES DE RESPONSABILIDAD`}>
        <p>
          Los empleados digitales de Centinelia son asistentes de inteligencia artificial y no sustituyen la
          asesoría profesional legal, médica, financiera ni ninguna otra especialidad regulada. Centinelia no
          se hace responsable de decisiones tomadas por terceros con base en la información proporcionada por
          el empleado digital.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          El Cliente es responsable de mantener actualizada la base de conocimiento del empleado y de
          verificar la exactitud de la información compartida con sus clientes finales. Las interacciones
          pueden ser grabadas con fines de calidad y mejora del modelo. El Cliente acepta notificar a sus
          clientes finales de esta posibilidad conforme a la Ley Federal de Protección de Datos Personales
          en Posesión de los Particulares (México).
        </p>
      </Clause>

      <Clause title={`${n(8)}. USO RESPONSABLE Y CUMPLIMIENTO LEGAL`}>
        <p>
          <strong>Uso permitido.</strong> El Cliente utilizará al empleado digital exclusivamente para
          comunicaciones con personas que tengan o hayan manifestado interés en establecer una relación
          comercial con el negocio del Cliente: (i) atender comunicaciones entrantes; (ii) dar seguimiento a
          prospectos que proporcionaron sus datos voluntariamente; (iii) confirmar, modificar o cancelar
          compromisos con clientes existentes; y (iv) ejecutar tareas operativas internas autorizadas.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <strong>Lista Nacional de No Llamar (LNCL).</strong> Para llamadas salientes, el Cliente es el
          único responsable de verificar que los números de destino no estén registrados en la LNCL
          administrada por PROFECO, conforme a la LFPC artículos 17 BIS y 17 BIS 2.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <strong>Usos prohibidos.</strong> Queda expresamente prohibido utilizar al empleado digital para:
          (i) prospección masiva sin consentimiento previo; (ii) contactar reiteradamente a personas que
          hayan solicitado no ser contactadas; o (iii) cualquier actividad contraria a la legislación
          mexicana aplicable.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <strong>Responsabilidad.</strong> Centinelia actúa exclusivamente como proveedor de tecnología.
          El Cliente libera a Centinelia de toda responsabilidad derivada del uso que dé al servicio y se
          compromete a indemnizar a Centinelia respecto de cualquier reclamación, sanción o multa iniciada
          por PROFECO, IFT o cualquier autoridad competente derivada de las comunicaciones realizadas.
        </p>
      </Clause>

      <Clause title={`${n(9)}. SOPORTE`}>
        <p>
          El Cliente tiene acceso a soporte técnico por WhatsApp y correo electrónico con tiempos de
          respuesta de hasta 24 horas hábiles. Actualizaciones de configuración del empleado (personalidad,
          base de conocimiento, horarios, metas, límites de autoridad) pueden realizarse directamente desde
          el portal sin necesidad de contactar soporte.
        </p>
      </Clause>

      <Clause title={`${n(10)}. USO DE MARCA Y CASOS DE ÉXITO`}>
        <p>
          Al aceptar este contrato, el Cliente autoriza a Centinelia y a Pneuma Studio a mencionar el nombre
          y logotipo de <strong>{agent.business_name}</strong> como caso de éxito en materiales de
          marketing, sitio web, redes sociales y presentaciones comerciales. Esta autorización no implica
          ningún respaldo activo del Cliente hacia Centinelia y puede revocarse en cualquier momento
          mediante solicitud escrita a <strong>hola@centinelia.mx</strong>.
        </p>
      </Clause>

      <Clause title={`${n(11)}. ACEPTACIÓN`}>
        <p>
          Al firmar este contrato, el Cliente declara haber leído, entendido y aceptado todos los términos
          y condiciones establecidos en el presente documento. Este contrato entra en vigor en la fecha de
          aceptación digital y se considera vinculante para ambas partes.
        </p>
      </Clause>

      {signedAt
        ? <SignatureBlock name={agent.client_name} date={signedAt} ip={agent.contract_ip} />
        : <div style={{ marginTop: '2.5rem', borderTop: '1px solid currentColor', opacity: 0.12 }} />
      }

      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', opacity: 0.4, textAlign: 'center' }}>
        Documento generado el {today} · Centinelia by Pneuma Studio
      </p>
    </div>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.03em', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SignatureBlock({ name, date, ip }: { name: string; date: string; ip?: string | null }) {
  return (
    <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '2px solid currentColor', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.5, marginBottom: '0.75rem' }}>Prestador</div>
        <div style={{ fontSize: '0.85rem' }}>Centinelia / Pneuma Studio</div>
        <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.25rem' }}>Firmado digitalmente</div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.5, marginBottom: '0.75rem' }}>Cliente</div>
        <div style={{ fontSize: '0.85rem' }}>{name}</div>
        <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.25rem' }}>Aceptado el {date}</div>
        {ip && <div style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '0.15rem' }}>IP: {ip}</div>}
      </div>
    </div>
  );
}
