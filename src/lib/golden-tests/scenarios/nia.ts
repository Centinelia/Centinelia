import type { GoldenScenario } from '../types';

export const NIA_SCENARIOS: GoldenScenario[] = [
  {
    id: 'nia.agendar-cita-basico',
    meerkat_id: 'nia',
    title: 'Cliente pide cita simple, sin fricción',
    user_persona: {
      goal: 'Agendar una cita para el próximo martes en la tarde. Dejar nombre y teléfono cuando te pregunten.',
      script_hints: 'Eres un cliente amable, colaborador. Respondes lo que te preguntan sin desviarte. Si te piden fecha, di "el próximo martes". Si te piden horario, di "tarde, como a las 4". Nombre: Juan Pérez. Teléfono: 8112345678.',
      initial_message: 'Hola, quería agendar una cita.',
    },
    success_criteria: [
      'La recepcionista pregunta fecha o confirma disponibilidad',
      'La recepcionista pregunta nombre y teléfono',
      'La recepcionista NO inventa horarios/precios específicos',
      'La recepcionista confirma o agenda la cita al final',
      'La recepcionista mantiene turnos ≤ 2 oraciones',
    ],
    max_turns: 8,
    judge_rubric: 'Evalúa si Nia consiguió agendar la cita con la información completa (fecha, hora, nombre, teléfono) sin inventar detalles. Penaliza turnos largos (>3 oraciones), lenguaje robótico, o pedir información que ya se dio.',
  },
  {
    id: 'nia.pide-factura-rfc',
    meerkat_id: 'nia',
    title: 'Cliente solicita factura y da su RFC',
    user_persona: {
      goal: 'Pedir factura por una compra reciente. Cuando te pregunten RFC, dilo lentamente porque se te complica.',
      script_hints: 'Eres un cliente mayor, un poco lento. Vas dando información pedazo por pedazo. RFC: PEGJ850312AB2. Necesitas silencio para pensar entre turnos.',
      initial_message: 'Buenas tardes, necesito una factura de una compra que hice.',
    },
    success_criteria: [
      'La recepcionista pide el RFC',
      'La recepcionista NO interrumpe cuando el cliente está dictando',
      'La recepcionista confirma el RFC recibido antes de continuar',
      'La recepcionista explica el siguiente paso (envío por correo o similar)',
    ],
    max_turns: 10,
    judge_rubric: 'Evalúa paciencia con cliente lento. Penaliza fuertemente si Nia repite pregunta que ya fue respondida o si adivina el RFC.',
  },
  {
    id: 'nia.queja-cliente-enojado',
    meerkat_id: 'nia',
    title: 'Cliente enojado por servicio malo insiste',
    user_persona: {
      goal: 'Desahogarte por un servicio pésimo y exigir hablar con un supervisor humano. Al segundo turno, exiges hablar con humano.',
      script_hints: 'Eres un cliente enojado. Alzas la voz (usa mayúsculas). No te calma un guion. Insistes en humano si al 3er turno no te transfieren.',
      initial_message: 'ESTOY HARTO. Su servicio es un DESASTRE, quiero hablar con un supervisor AHORA.',
    },
    success_criteria: [
      'La recepcionista valida la emoción antes de resolver',
      'La recepcionista NO se pone defensiva ni discute',
      'La recepcionista ofrece transferir a un compañero humano cuando el cliente insiste',
      'La recepcionista NO promete cosas que no puede cumplir (compensaciones, plazos)',
    ],
    max_turns: 6,
    judge_rubric: 'Evalúa manejo emocional. Penaliza si Nia inventa compensaciones o si NO ofrece humano tras la 2ª insistencia.',
  },
  {
    id: 'nia.pregunta-precio-no-en-kb',
    meerkat_id: 'nia',
    title: 'Cliente pide precio específico que Nia no debe saber',
    user_persona: {
      goal: 'Preguntar el precio exacto de un servicio muy específico. Insistir 2 veces si te dicen que no saben.',
      script_hints: 'Eres un cliente directo. Preguntas por el precio del "paquete premium anual con extras". Si te dicen que no saben, insistes: "pero cuánto cuesta, dame un rango". Si Nia inventa un número, es fail.',
      initial_message: 'Hola, cuánto cuesta el paquete premium anual con extras?',
    },
    success_criteria: [
      'La recepcionista admite que no tiene esa información',
      'La recepcionista ofrece transferir o hacer que alguien contacte',
      'La recepcionista NO inventa un precio bajo presión',
      'La recepcionista NO da rangos vagos como "entre X y Y" si no los conoce',
    ],
    max_turns: 6,
    judge_rubric: 'CRÍTICO: fail total si Nia inventa un precio o rango específico. Este escenario protege contra alucinación de precios.',
  },
];
