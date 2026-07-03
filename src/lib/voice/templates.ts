import type { AgentFeatures } from '@/types/agent';

export type GiroTemplate =
  | 'restaurante'
  | 'consultorio'
  | 'estetica'
  | 'agencia'
  | 'retail'
  | 'general';

export interface AgentTemplate {
  id: GiroTemplate;
  emoji: string;
  label: string;
  description: string;
  features: AgentFeatures;
  kbPlaceholder: string;
  orderLabel: string;       // "platillo" | "producto" | "servicio"
  appointmentLabel: string; // "consulta" | "reservación" | "cita"
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'restaurante',
    emoji: '🍽️',
    label: 'Restaurante',
    description: 'Taquería, cafetería, pizzería, comida rápida',
    features: {
      receptionist:            true,
      lead_qualification:      false,
      appointment_booking:     true,
      existing_client_support: false,
      smart_transfer:          true,
      order_taking:            true,
      multilingual:            false,
      client_memory:           false,
      whatsapp_escalation:     false,
      outbound_calls:          false,
    },
    orderLabel: 'platillo',
    appointmentLabel: 'reservación',
    kbPlaceholder: `MENÚ:
Entradas:
- Guacamole con totopos: $85
- Queso fundido: $110

Platos fuertes:
- Tacos de pastor (3): $75
- Burrito de carne asada: $120
- Quesadillas (2): $90

Bebidas:
- Agua fresca: $35
- Refresco: $30
- Café americano: $45

INFORMACIÓN:
Horario: Lunes a Sábado 8am - 10pm, Domingo 9am - 8pm
¿Hacen reservaciones? Sí, para grupos de 6 o más personas.
¿Tienen opciones vegetarianas? Sí, preguntar al mesero.
¿Tienen estacionamiento? Sí, estacionamiento gratuito.
¿Aceptan tarjeta? Sí, todas las tarjetas y efectivo.`,
  },

  {
    id: 'consultorio',
    emoji: '🏥',
    label: 'Consultorio',
    description: 'Médico, dental, psicología, nutrición, veterinaria',
    features: {
      receptionist:            true,
      lead_qualification:      false,
      appointment_booking:     true,
      existing_client_support: true,
      smart_transfer:          true,
      order_taking:            false,
      multilingual:            false,
      client_memory:           false,
      whatsapp_escalation:     false,
      outbound_calls:          false,
    },
    orderLabel: 'servicio',
    appointmentLabel: 'consulta',
    kbPlaceholder: `ESPECIALIDADES Y PRECIOS:
- Consulta general: $500
- Consulta de seguimiento: $350
- Revisión dental: $400
- Limpieza dental: $800

MÉDICOS / ESPECIALISTAS:
- Dr. García, Medicina General (Lun, Mié, Vie)
- Dra. Martínez, Pediatría (Mar, Jue)

INFORMACIÓN:
¿Se necesita cita? Sí, todas las consultas son con cita previa.
¿Aceptan seguro médico? Sí, GNP y Metlife. Preguntar disponibilidad.
¿Atienden urgencias? Sí, llamar directo al consultorio.
Tiempo de consulta: 30 minutos aproximadamente.
¿Cuánto tiempo antes debo llegar? 10 minutos antes de su cita.`,
  },

  {
    id: 'estetica',
    emoji: '✂️',
    label: 'Salón / Estética',
    description: 'Salón de belleza, barbería, spa, uñas',
    features: {
      receptionist:            true,
      lead_qualification:      false,
      appointment_booking:     true,
      existing_client_support: false,
      smart_transfer:          true,
      order_taking:            false,
      multilingual:            false,
      client_memory:           false,
      whatsapp_escalation:     false,
      outbound_calls:          false,
    },
    orderLabel: 'servicio',
    appointmentLabel: 'cita',
    kbPlaceholder: `SERVICIOS Y PRECIOS:
Cabello:
- Corte de dama: $200
- Corte de caballero: $120
- Tinte completo: $500
- Balayage: $800
- Tratamiento keratina: $1,200

Uñas:
- Manicure: $150
- Pedicure: $200
- Uñas acrílicas: $350

Maquillaje:
- Maquillaje social: $400
- Maquillaje de novia: $800

INFORMACIÓN:
¿Se necesita cita? Sí, aunque a veces hay lugar sin cita.
¿Cuánto dura un servicio de tinte? Entre 2 y 3 horas.
¿Qué productos usan? Productos profesionales Loreal y Wella.
¿Aceptan tarjeta? Sí, y transferencia.`,
  },

  {
    id: 'agencia',
    emoji: '💼',
    label: 'Agencia / Servicios',
    description: 'Agencia, despacho, consultoría, servicios B2B',
    features: {
      receptionist:            true,
      lead_qualification:      true,
      appointment_booking:     true,
      existing_client_support: true,
      smart_transfer:          true,
      order_taking:            false,
      multilingual:            false,
      client_memory:           false,
      whatsapp_escalation:     false,
      outbound_calls:          false,
    },
    orderLabel: 'servicio',
    appointmentLabel: 'reunión',
    kbPlaceholder: `SERVICIOS:
- Servicio A: desde $X
- Servicio B: desde $X
- Paquete completo: desde $X

¿CÓMO FUNCIONA?
1. Llamada de diagnóstico gratuita (30 min)
2. Propuesta personalizada en 48 horas
3. Inicio del proyecto en X semanas

INFORMACIÓN:
Tiempo de entrega: X a X semanas según el proyecto.
¿Tienen contratos? Sí, con garantía de X meses.
¿Trabajan con negocios de cualquier tamaño? Sí.
¿Dónde se ubican? [Ciudad], aunque atendemos clientes remotamente.`,
  },

  {
    id: 'retail',
    emoji: '🛍️',
    label: 'Tienda / Retail',
    description: 'Tienda física, comercio, ferretería, farmacia',
    features: {
      receptionist:            true,
      lead_qualification:      false,
      appointment_booking:     false,
      existing_client_support: true,
      smart_transfer:          true,
      order_taking:            true,
      multilingual:            false,
      client_memory:           false,
      whatsapp_escalation:     false,
      outbound_calls:          false,
    },
    orderLabel: 'producto',
    appointmentLabel: 'cita',
    kbPlaceholder: `PRODUCTOS PRINCIPALES:
- Producto A: $XXX
- Producto B: $XXX
- Producto C: $XXX

INFORMACIÓN:
¿Tienen envío a domicilio? Sí, envío gratis en compras mayores a $XXX.
¿Cuánto tarda el envío? 1-3 días hábiles.
¿Aceptan devoluciones? Sí, hasta 30 días con ticket de compra.
¿Tienen estacionamiento? Sí / No.
¿Aceptan tarjeta? Sí, todas las tarjetas y efectivo.`,
  },

  {
    id: 'general',
    emoji: '⚙️',
    label: 'General',
    description: 'Configura manualmente las funcionalidades',
    features: {
      receptionist:            true,
      lead_qualification:      true,
      appointment_booking:     true,
      existing_client_support: false,
      smart_transfer:          true,
      order_taking:            false,
      multilingual:            false,
      client_memory:           false,
      whatsapp_escalation:     false,
      outbound_calls:          false,
    },
    orderLabel: 'producto',
    appointmentLabel: 'cita',
    kbPlaceholder: `SERVICIOS / PRODUCTOS:
- ...

INFORMACIÓN:
¿Cuál es el horario? ...
¿Aceptan tarjeta? ...`,
  },
];

export const TEMPLATE_MAP = Object.fromEntries(
  AGENT_TEMPLATES.map(t => [t.id, t])
) as Record<GiroTemplate, AgentTemplate>;
