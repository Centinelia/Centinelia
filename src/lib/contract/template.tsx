import { FEATURE_LABELS, PLAN_LABELS } from '@/types/agent';
import type { VoiceAgent } from '@/types/agent';
import { MINUTES_TIER_CONFIG, MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { MinutesTier } from '@/lib/billing/plans';

function fmt(date: string) {
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ContractDocument({ agent }: { agent: VoiceAgent }) {
  const features       = agent.features ?? {};
  const planLabel      = PLAN_LABELS[agent.plan] ?? agent.plan;
  const tierCfg         = agent.minutes_plan ? MINUTES_TIER_CONFIG[agent.minutes_plan as MinutesTier] : null;
  const monthlyCfg      = (agent.plan && agent.minutes_plan) ? MONTHLY_CONFIG[agent.plan as 'comercial' | 'pro']?.[agent.minutes_plan as MinutesTier] : null;
  const monthlyPrice    = monthlyCfg?.mxn ?? 0;
  const minutesIncluded = agent.minutes_included ?? (tierCfg?.minutes ?? 0);
  const signedAt       = agent.contract_accepted_at ? fmt(agent.contract_accepted_at) : null;
  const today          = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const included = (Object.entries(features) as [keyof typeof FEATURE_LABELS, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => FEATURE_LABELS[k]);

  const excluded = (Object.entries(features) as [keyof typeof FEATURE_LABELS, boolean][])
    .filter(([, v]) => !v)
    .map(([k]) => FEATURE_LABELS[k]);

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
          Contrato de Servicios de Agente de Voz IA
        </div>
        <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.6 }}>Centinelia: Pneuma Studio</div>
      </div>

      <Clause title="1. PARTES">
        <p>
          <strong>Prestador de servicios:</strong> Pneuma Studio, desarrollador de la plataforma Centinelia, en adelante &ldquo;Centinelia&rdquo;.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <strong>Cliente:</strong> {agent.business_name}, representado por {agent.client_name}, en adelante &ldquo;el Cliente&rdquo;.
        </p>
      </Clause>

      <Clause title="2. OBJETO DEL CONTRATO">
        <p>
          Centinelia se compromete a proporcionar al Cliente un agente de voz impulsado por inteligencia artificial bajo el
          plan <strong>{planLabel}</strong>, configurado específicamente para el negocio <strong>{agent.business_name}</strong>.
          El agente operará en el número telefónico asignado{agent.phone_number ? ` (${agent.phone_number})` : ''} y
          atenderá llamadas entrantes de acuerdo con la configuración acordada.
        </p>
      </Clause>

      <Clause title="3. SERVICIOS INCLUIDOS">
        <p>El plan <strong>{planLabel}</strong> incluye los siguientes servicios:</p>
        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
          {included.map(s => <li key={s} style={{ marginTop: '0.25rem' }}>✓ {s}</li>)}
        </ul>
        <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.7 }}>
          El agente también cuenta con {minutesIncluded} minutos mensuales de conversación incluidos.
          Los minutos no utilizados se transfieren al mes siguiente, con un límite de acumulación equivalente a un mes adicional de tu plan.
        </p>
      </Clause>

      {excluded.length > 0 && (
        <Clause title="4. SERVICIOS NO INCLUIDOS">
          <p>Los siguientes servicios <strong>no están incluidos</strong> en el plan contratado y requerirán una actualización de plan para ser habilitados:</p>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
            {excluded.map(s => <li key={s} style={{ marginTop: '0.25rem' }}>✗ {s}</li>)}
          </ul>
        </Clause>
      )}

      <Clause title={`${excluded.length > 0 ? '5' : '4'}. FACTURACIÓN`}>
        <p>
          La mensualidad del servicio es de <strong>${monthlyPrice.toLocaleString('es-MX')} MXN + IVA</strong> por mes, correspondiente
          al plan de minutos <strong>{tierCfg?.label ?? agent.minutes_plan ?? ','}</strong> ({minutesIncluded} min/mes).
          El cobro se realizará de forma automática a través de Stripe en la fecha de renovación mensual.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          En caso de fallo en el pago, el Cliente recibirá notificación por correo electrónico y/o WhatsApp y contará con un período de gracia de
          3 días naturales para regularizar el pago antes de que el agente sea pausado automáticamente.
          El servicio se reanuda al actualizar el método de pago.
        </p>
      </Clause>

      <Clause title={`${excluded.length > 0 ? '6' : '5'}. DURACIÓN Y TERMINACIÓN`}>
        <p>
          El contrato tiene vigencia mensual con renovación automática. Para cancelar el servicio, el Cliente deberá
          contactar al equipo de Centinelia con al menos 5 días naturales de anticipación a la fecha de renovación.
          No se realizan reembolsos de períodos parciales.
          Centinelia se reserva el derecho de dar de baja el servicio con previo aviso de 15 días naturales.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          Si el agente permanece pausado por un período continuo superior a 3 meses consecutivos sin que el Cliente
          regularice el servicio, Centinelia se reserva el derecho de reasignar el número telefónico asignado a otro
          cliente. Esta reasignación se notificará al Cliente con al menos 15 días naturales de anticipación.
        </p>
      </Clause>

      <Clause title={`${excluded.length > 0 ? '7' : '6'}. LIMITACIONES DE RESPONSABILIDAD`}>
        <p>
          Centinelia es un agente de voz automatizado. No sustituye la asesoría profesional legal, médica o financiera.
          Centinelia no se hace responsable de decisiones tomadas por terceros basadas en información proporcionada por el agente.
          El Cliente es responsable de mantener actualizada la base de conocimiento del agente y de verificar la exactitud
          de la información compartida con sus clientes finales.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          Las llamadas pueden ser grabadas con fines de calidad y entrenamiento del modelo. El Cliente acepta notificar a
          sus clientes finales de esta posibilidad de conformidad con la Ley Federal de Protección de Datos Personales en
          Posesión de los Particulares (México).
        </p>
      </Clause>

      <Clause title={`${excluded.length > 0 ? '8' : '7'}. SOPORTE`}>
        <p>
          El Cliente tiene acceso a soporte técnico por WhatsApp y correo electrónico. Los tiempos de respuesta son de
          hasta 24 horas hábiles. Actualizaciones de configuración del agente (guión, horarios, base de conocimiento)
          pueden realizarse directamente desde el portal del cliente.
        </p>
      </Clause>

      <Clause title={`${excluded.length > 0 ? '9' : '8'}. USO DE MARCA Y CASOS DE ÉXITO`}>
        <p>
          Al aceptar este contrato, el Cliente autoriza a Centinelia y a Pneuma Studio a mencionar el nombre
          y logotipo de <strong>{agent.business_name}</strong> como caso de éxito en materiales de marketing,
          sitio web, redes sociales y presentaciones comerciales. Esta autorización no implica ningún
          respaldo activo del Cliente hacia Centinelia y puede ser revocada en cualquier momento mediante
          solicitud escrita a <strong>hola@centinelia.mx</strong>.
        </p>
      </Clause>

      <Clause title={`${excluded.length > 0 ? '10' : '9'}. ACEPTACIÓN`}>
        <p>
          Al firmar este contrato, el Cliente declara haber leído, entendido y aceptado todos los términos y condiciones
          establecidos en el presente documento. Este contrato entra en vigor en la fecha de aceptación.
        </p>
      </Clause>

      {signedAt
        ? <SignatureBlock name={agent.client_name} date={signedAt} ip={agent.contract_ip} />
        : (
          <div style={{ marginTop: '2.5rem', borderTop: '1px solid currentColor', opacity: 0.15 }} />
        )
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
