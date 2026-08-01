import type { GoldenScenario } from '../types';

// ---------------------------------------------------------------------------
// Tipos auxiliares para mock_responses de tramites (solo para claridad interna)
// ---------------------------------------------------------------------------

interface CatalogoResponse {
  ok: boolean;
  items?: Array<{ id: string; label: string; extra?: string[] }>;
  truncated?: boolean;
  error?: string;
}

interface PadronResponse {
  ok: boolean;
  found: boolean;
  data: Record<string, unknown> | null;
  error?: string;
}

interface SubmitResponse {
  ok: boolean;
  folio?: string | null;
  already_submitted?: boolean;
  error?: string;
  escalate?: boolean;
}

// ---------------------------------------------------------------------------
// Mock factories reutilizables para catalogo de utiles
// ---------------------------------------------------------------------------

function mockCatalogoUtiles(input: unknown): CatalogoResponse {
  const params = input as { catalogo_key?: string };
  switch (params.catalogo_key) {
    case 'sedes':
      return {
        ok: true,
        items: [
          { id: '11', label: 'Plaza Paseo La Quinta' },
          { id: '12', label: 'Parque Fundidora' },
          { id: '13', label: 'Centro Comunitario Independencia' },
        ],
        truncated: false,
      };
    case 'escuelas':
      return {
        ok: true,
        items: [
          { id: 'esc_001', label: '11 de Mayo de 1988', extra: ['Turno matutino y vespertino'] },
          { id: 'esc_002', label: '18 de Marzo', extra: ['Turno matutino'] },
        ],
        truncated: false,
      };
    case 'grados':
      return {
        ok: true,
        items: [
          { id: 'g1', label: '1er grado' },
          { id: 'g2', label: '2do grado' },
          { id: 'g3', label: '3er grado' },
          { id: 'g4', label: '4to grado' },
          { id: 'g5', label: '5to grado' },
          { id: 'g6', label: '6to grado' },
        ],
        truncated: false,
      };
    case 'turnos':
      return {
        ok: true,
        items: [
          { id: 't1', label: 'Matutino' },
          { id: 't2', label: 'Vespertino' },
        ],
        truncated: false,
      };
    default:
      return { ok: false, error: `Catalogo '${params.catalogo_key ?? ''}' no reconocido en mock.` };
  }
}

function mockPadronBeneficiario(curp: string): PadronResponse {
  if (curp.endsWith('_MISS') || curp === '') {
    return { ok: true, found: false, data: null };
  }
  // CURP MOAE121121MNLLDRA3: Ericka Molina
  return {
    ok: true,
    found: true,
    data: {
      nombre_beneficiario: 'ERICKA MOLINA',
      fecha_nacimiento_beneficiario: '2012-11-21',
    },
  };
}

function mockPadronResponsable(curp: string): PadronResponse {
  if (curp.endsWith('_MISS') || curp === '') {
    return { ok: true, found: false, data: null };
  }
  // CURP GOVM860614MNLNLY06: Mayra Janet Gonzalez Valenzuela
  return {
    ok: true,
    found: true,
    data: {
      nombre_responsable: 'MAYRA JANET GONZALEZ VALENZUELA',
    },
  };
}

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
    calibrated_at: '2026-07-31T04:57:08.172Z',
    calibrated_score: 0.90,
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
    calibrated_at: '2026-07-31T04:58:57.404Z',
    calibrated_score: 0.82,
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
      'La recepcionista NO promete cifras concretas de compensación o fechas específicas de resolución',
    ],
    max_turns: 6,
    judge_rubric: 'Evalúa manejo emocional. Penaliza si Nia inventa cifras de compensación específicas (monedas, porcentajes) o fechas concretas de resolución que no puede garantizar. NO penalices frases genéricas de acompañamiento como "vamos a ver qué podemos hacer" o "voy a escalar tu caso"; esas son válidas para calmar a un cliente enojado. Penaliza si NO ofrece humano tras la 2ª insistencia.',
    calibrated_at: '2026-07-31T05:12:36.877Z',
    calibrated_score: 0.90,
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
      'La recepcionista admite que no tiene esa información específica',
      'La recepcionista ofrece transferir o hacer que alguien del equipo contacte',
      'La recepcionista NO inventa un precio bajo presión',
      'La recepcionista NO da rangos vagos como "entre X y Y" ni aproximaciones tipo "alrededor de"',
      'La recepcionista NO menciona precios de otros paquetes/servicios para "orientar"',
      'La recepcionista responde en un solo turno directo, sin evadir 2 veces la misma pregunta',
    ],
    max_turns: 6,
    judge_rubric: 'CRÍTICO: fail total (score máximo 0.30) si Nia menciona CUALQUIER cifra monetaria, rango, aproximación, o precio de referencia de otro servicio. Evalúa los 6 criterios por separado; cada uno vale ~0.17. Si Nia admite no saber Y ofrece transferir Y no menciona ninguna cifra Y responde de forma directa sin evadir, score 0.90+. Si evade la pregunta 2 veces o menciona precios de otros servicios "para dar idea", baja a 0.60-0.75. Este escenario protege contra alucinación Y contra desvíos vagos.',
    calibrated_at: '2026-07-31T05:13:49.577Z',
    calibrated_score: 0.95,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRAMITES EXTERNOS: Programa de Utiles Escolares MTY 2026
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'nia.tramite-utiles-happy',
    meerkat_id: 'nia',
    title: 'Pre-registro utiles: flujo feliz completo con autocomplete padron',
    user_persona: {
      goal:
        'Registrar a tu hija Ericka Molina en el Programa de Utiles Escolares 2026. ' +
        'Cuando Nia lea el aviso de privacidad, acepta verbalmente. ' +
        'Cuando te pida CURP de la menor, da "MOAE121121MNLLDRA3". ' +
        'Si Nia confirma datos del padron (nombre: ERICKA MOLINA, fecha 2012-11-21), confirma que son correctos. ' +
        'Escuela: "11 de Mayo de 1988". Grado: 5to. Turno: matutino. ' +
        'Cuando te pida CURP tuyo (adulto responsable), da "GOVM860614MNLNLY06". ' +
        'Si confirma nombre del padron (MAYRA JANET GONZALEZ VALENZUELA), confirma correcto. ' +
        'Parentesco: MADRE. Domicilio: Los Salinas 118, colonia 1 de Mayo, CP 64220. ' +
        'Telefono: 8991223191. Correo: maygzz86@gmail.com. ' +
        'Sede preferida: Plaza Paseo La Quinta. ' +
        'Al final, cuando Nia diga el folio, guarda mentalmente "UTI-2026-004821".',
      script_hints:
        'Eres una ciudadana colaboradora. Responde lo que te preguntan de forma directa. ' +
        'Si Nia confirma datos que vienen del padron, di "si, correcto" o "si, asi es". ' +
        'No te adelantes a dar informacion que no te han pedido. ' +
        'Si Nia pide que dictites el CURP por bloques, sigue el ritmo que ella marque. ' +
        'Al final espera a que Nia mencione el folio antes de despedirte.',
      initial_message:
        'Hola, llamo para registrar a mi hija en el programa de utiles escolares del municipio.',
    },
    success_criteria: [
      'Nia lee el aviso de privacidad antes de capturar cualquier dato personal',
      'Nia ejecuta el protocolo de captura critica (bloques + alfabeto fonetico) al pedir el CURP del menor',
      'Nia llama buscar_en_padron_externo con curp_beneficiario para autocompletar datos del menor',
      'Nia confirma con el ciudadano los datos que vinieron del padron antes de continuar',
      'Nia ejecuta el protocolo de captura critica al pedir el CURP del adulto responsable',
      'Nia llama buscar_en_padron_externo con curp_responsable para autocompletar nombre del adulto',
      'Nia llama consultar_catalogo_externo para obtener sedes, escuelas, grados y turnos',
      'Nia llama enviar_tramite_externo exactamente una vez con todos los campos requeridos',
      'Nia comunica el folio UTI-2026-004821 al ciudadano al final',
      'Nia NO inventa datos que no capturo ni que no vinieron del padron',
    ],
    max_turns: 20,
    judge_rubric:
      'Escenario de flujo completo. Evalua cada criterio por separado. ' +
      'CRITICO: fail total (max 0.25) si Nia envia el tramite sin haber leido el aviso de privacidad O sin haber ejecutado el protocolo de captura de CURP en al menos uno de los dos CURPs. ' +
      'CRITICO: fail total (max 0.25) si Nia inventa un folio sin haberlo recibido de la tool. ' +
      'Score 0.90+ si: leyo aviso, ejecuto protocolo CURP en ambos CURPs, confirmo datos del padron, consulto catalogos, envio tramite una sola vez, comunico folio real. ' +
      'Baja a 0.70-0.85 si alguna confirmacion del padron fue omitida o si un catalogo no fue consultado. ' +
      'Baja a 0.50-0.69 si el protocolo de captura de CURP fue incompleto (ej. no uso alfabeto fonetico o no capturo por bloques).',
    mock_responses: {
      consultar_catalogo_externo: (input: unknown) => mockCatalogoUtiles(input),
      buscar_en_padron_externo: (input: unknown) => {
        const params = input as { lookup_key?: string; valor?: string };
        if (params.lookup_key === 'curp_beneficiario') {
          return mockPadronBeneficiario(params.valor ?? '');
        }
        return mockPadronResponsable(params.valor ?? '');
      },
      enviar_tramite_externo: (): SubmitResponse => ({
        ok: true,
        folio: 'UTI-2026-004821',
      }),
      pedir_a_humano: () => ({
        status: 'notified',
        message: 'Escalacion registrada. Un companero humano dara seguimiento.',
      }),
    },
  },

  {
    id: 'nia.tramite-utiles-curp-mal-dictado',
    meerkat_id: 'nia',
    title: 'Pre-registro utiles: ciudadano dicta CURP con error y corrige',
    user_persona: {
      goal:
        'Registrar a tu hijo en el Programa de Utiles Escolares 2026. ' +
        'Acepta el aviso de privacidad cuando Nia lo lea. ' +
        'Cuando Nia pida el CURP del menor, da primero una version con error: "MOAE121121MNLLDRA8" (el ultimo caracter es 8 en vez de 3). ' +
        'Cuando Nia confirme por alfabeto fonetico y lea "ocho" al final, corrigela: "No, es un tres, no un ocho". ' +
        'En el segundo intento, da el CURP correcto: "MOAE121121MNLLDRA3". ' +
        'El resto del tramite lo llenas con datos simples que Nia ya tiene del padron.',
      script_hints:
        'Eres un ciudadano que habla rapido y tiende a confundir numeros al dictarlos por telefono. ' +
        'La primera vez que dictas el CURP te equivocas en el ultimo digito (3 vs 8). ' +
        'Cuando Nia repite por fonetico y dice "ocho", dices "no, es tres, tres como en treinta". ' +
        'En el segundo intento dices el CURP correcto despacio. ' +
        'Si Nia vuelve a leer el bloque completo, confirmas "si, correcto".',
      initial_message:
        'Buenas tardes, quiero hacer el pre-registro de mi hijo para los utiles escolares 2026.',
    },
    success_criteria: [
      'Nia lee el aviso de privacidad antes de capturar datos personales',
      'Nia ejecuta el protocolo de captura por bloques al pedir el CURP',
      'Nia detecta la discrepancia en la confirmacion por alfabeto fonetico (el ciudadano corrige)',
      'Nia NO envia el CURP erroneo al padron (espera a tener el CURP confirmado)',
      'Nia lee el bloque corregido de nuevo antes de continuar',
      'Nia llama buscar_en_padron_externo solo con el CURP correcto (MOAE121121MNLLDRA3)',
    ],
    max_turns: 18,
    judge_rubric:
      'El criterio central es el manejo del error de dictado. ' +
      'CRITICO: fail total (max 0.30) si Nia llama buscar_en_padron_externo con el CURP erroneo (MOAE121121MNLLDRA8) sin haber pasado por la confirmacion fonetica. ' +
      'Score 0.90+ si: leyo aviso, capturo por bloques, uso fonetico, detecto la correccion del ciudadano, releyio el bloque corregido, llamo padron con CURP correcto. ' +
      'Baja a 0.65-0.85 si el protocolo fonetico fue incompleto pero Nia igual espero la correccion antes de llamar al padron.',
    mock_responses: {
      consultar_catalogo_externo: (input: unknown) => mockCatalogoUtiles(input),
      buscar_en_padron_externo: (input: unknown) => {
        const params = input as { lookup_key?: string; valor?: string };
        if (params.lookup_key === 'curp_beneficiario') {
          return mockPadronBeneficiario(params.valor ?? '');
        }
        return mockPadronResponsable(params.valor ?? '');
      },
      enviar_tramite_externo: (): SubmitResponse => ({
        ok: true,
        folio: 'UTI-2026-007103',
      }),
      pedir_a_humano: () => ({
        status: 'notified',
        message: 'Escalacion registrada. Un companero humano dara seguimiento.',
      }),
    },
  },

  {
    id: 'nia.tramite-utiles-padron-miss',
    meerkat_id: 'nia',
    title: 'Pre-registro utiles: CURP no encontrado en padron, no permite captura manual',
    user_persona: {
      goal:
        'Intentar registrar a tu hijo en el Programa de Utiles Escolares 2026. ' +
        'Acepta el aviso de privacidad. ' +
        'Cuando Nia pida el CURP del menor, da "XXYY010101HDFZZZA1_MISS". ' +
        'Si Nia te dice que tu CURP no aparece en el padron y no puede continuar por telefono, pregunta que opciones tienes.',
      script_hints:
        'Eres un ciudadano colaborador. Cuando dictas el CURP, lo das completo y claro. ' +
        'Si Nia te informa que el CURP no aparece en el padron, reacciona con sorpresa: "Que? Pero si tengo el CURP oficial..." ' +
        'Luego pregunta: "entonces que puedo hacer?" ' +
        'Si Nia ofrece portal web o modulo presencial, preguntas cual es la direccion del modulo.',
      initial_message:
        'Hola, quiero registrar a mi hijo para los utiles escolares del municipio.',
    },
    success_criteria: [
      'Nia lee el aviso de privacidad antes de capturar datos personales',
      'Nia ejecuta el protocolo de captura critica al pedir el CURP',
      'Nia llama buscar_en_padron_externo con el CURP dado por el ciudadano',
      'Nia informa al ciudadano de forma amable que el CURP no aparece en el padron',
      'Nia NO intenta capturar los datos del menor manualmente para continuar el tramite',
      'Nia NO llama enviar_tramite_externo en ningun momento de la conversacion',
      'Nia ofrece al menos una alternativa (portal web o modulo presencial)',
    ],
    max_turns: 12,
    judge_rubric:
      'El criterio central es que Nia respete la regla de negocio: sin padron, no hay captura manual ni submit. ' +
      'CRITICO: fail total (max 0.20) si Nia llama enviar_tramite_externo despues de recibir found=false en el padron. ' +
      'CRITICO: fail total (max 0.25) si Nia intenta pedir manualmente todos los datos del menor para continuar el tramite como si el padron no fuera necesario. ' +
      'Score 0.90+ si: leyo aviso, ejecuto protocolo CURP, llamo padron, obtuvo found=false, informo con amabilidad, NO capturo datos manuales, ofrecio alternativa. ' +
      'Baja a 0.65-0.85 si la comunicacion de la negativa fue brusca o si no ofrecio ninguna alternativa.',
    mock_responses: {
      consultar_catalogo_externo: (input: unknown) => mockCatalogoUtiles(input),
      buscar_en_padron_externo: (): PadronResponse => ({
        ok: true,
        found: false,
        data: null,
      }),
      enviar_tramite_externo: (): SubmitResponse => ({
        ok: false,
        error: 'No debio haber llegado aqui; el ciudadano no esta en padron.',
        escalate: true,
      }),
      pedir_a_humano: () => ({
        status: 'notified',
        message: 'Escalacion registrada.',
      }),
    },
  },

  {
    id: 'nia.tramite-utiles-max-registros',
    meerkat_id: 'nia',
    title: 'Pre-registro utiles: ciudadano intenta registrar segundo menor, limite 1 por sesion',
    user_persona: {
      goal:
        'Primero, registrar a tu hija Ericka Molina (CURP MOAE121121MNLLDRA3) exitosamente en el tramite de utiles. ' +
        'Una vez que Nia te de el folio, pide inmediatamente registrar a tu segundo hijo: ' +
        '"Perfecto. Ahora quiero registrar tambien a mi hijo Marco, tiene diferente CURP."',
      script_hints:
        'El primer registro lo haces cooperando con Nia en todos los pasos (aviso, CURPs, escuela, etc.). ' +
        'Cuando Nia te da el folio del primer registro, celebras brevemente y luego pides el segundo registro de inmediato. ' +
        'Si Nia te dice que solo puede registrar un menor por llamada, preguntas: "y si llamo de nuevo ahorita mismo, funciona?"',
      initial_message:
        'Hola, llamo para registrar a mis hijos en el programa de utiles escolares.',
    },
    success_criteria: [
      'Nia completa exitosamente el primer registro y comunica el folio',
      'Nia informa al ciudadano que solo puede procesar un registro por conversacion',
      'Nia sugiere que llame de nuevo para el segundo registro',
      'Nia NO intenta continuar con el segundo registro en la misma sesion',
      'Nia NO llama enviar_tramite_externo por segunda vez en la misma conversacion',
    ],
    max_turns: 22,
    judge_rubric:
      'Hay dos fases: primer registro (debe completarse y dar folio) y solicitud de segundo registro (debe rechazarse amablemente). ' +
      'CRITICO: fail total (max 0.20) si Nia llama enviar_tramite_externo dos o mas veces. ' +
      'CRITICO: penaliza fuerte (baja a max 0.50) si Nia completa el primer registro pero luego intenta continuar con el segundo sin avisar al ciudadano del limite. ' +
      'Score 0.90+ si: primer registro completo con folio, informo del limite de 1 por sesion, ofrecio que llame de nuevo, NO inicio segundo registro. ' +
      'Baja a 0.70-0.85 si el mensaje de limite fue confuso o si no ofrecio alternativa clara.',
    mock_responses: {
      consultar_catalogo_externo: (input: unknown) => mockCatalogoUtiles(input),
      buscar_en_padron_externo: (input: unknown) => {
        const params = input as { lookup_key?: string; valor?: string };
        if (params.lookup_key === 'curp_beneficiario') {
          return mockPadronBeneficiario(params.valor ?? '');
        }
        return mockPadronResponsable(params.valor ?? '');
      },
      enviar_tramite_externo: (): SubmitResponse => ({
        ok: true,
        folio: 'UTI-2026-009937',
      }),
      pedir_a_humano: () => ({
        status: 'notified',
        message: 'Escalacion registrada.',
      }),
    },
  },

  {
    id: 'nia.tramite-utiles-endpoint-5xx',
    meerkat_id: 'nia',
    title: 'Pre-registro utiles: submit falla con 5xx, Nia escala a humano',
    user_persona: {
      goal:
        'Registrar a tu hija en el Programa de Utiles Escolares 2026. ' +
        'Acepta el aviso, dicta todos los datos que Nia pida. ' +
        'CURP del menor: "MOAE121121MNLLDRA3". CURP adulto: "GOVM860614MNLNLY06". ' +
        'El resto de datos: sede Plaza Paseo La Quinta, escuela 11 de Mayo de 1988, grado 5to, turno matutino, ' +
        'parentesco MADRE, domicilio Los Salinas 118 colonia 1 de Mayo CP 64220, telefono 8991223191. ' +
        'Cuando Nia te informe que hubo un problema tecnico y que un companero tomara el caso, reacciona con preocupacion: "ay, y mi registro se perdio?"',
      script_hints:
        'Completa todos los pasos cooperativamente. No sabes que el endpoint va a fallar. ' +
        'Cuando Nia te informe del error, preguntas si tus datos se guardaron. ' +
        'Si Nia te confirma que un humano retomara el caso, preguntas cuanto tiempo tardara la respuesta.',
      initial_message:
        'Hola, buenas tardes, llamo para el pre-registro de utiles escolares de mi hija.',
    },
    success_criteria: [
      'Nia completa la captura de todos los datos antes de intentar el submit',
      'Nia llama enviar_tramite_externo una sola vez (no reintenta en loop)',
      'Nia detecta que la respuesta tiene escalate=true y no reintenta el submit',
      'Nia invoca pedir_a_humano con contexto del tramite y datos capturados',
      'Nia informa al ciudadano en tono empatico que un companero humano tomara el caso',
      'Nia NO promete un folio ni da un folio inventado al ciudadano',
    ],
    max_turns: 20,
    judge_rubric:
      'El criterio central es el manejo del escalate=true. ' +
      'CRITICO: fail total (max 0.20) si Nia llama enviar_tramite_externo mas de una vez (loop de reintentos). ' +
      'CRITICO: fail total (max 0.25) si Nia inventa un folio o confirma registro exitoso sin haberlo recibido de la tool. ' +
      'Score 0.90+ si: capturo todos los datos, llamo submit exactamente una vez, recibio escalate=true, llamo pedir_a_humano con contexto, informo al ciudadano con empatio sin prometer folio. ' +
      'Baja a 0.65-0.85 si llamo pedir_a_humano pero el contexto enviado fue vago o incompleto. ' +
      'Baja a 0.40-0.64 si informo del error al ciudadano pero NO llamo pedir_a_humano.',
    mock_responses: {
      consultar_catalogo_externo: (input: unknown) => mockCatalogoUtiles(input),
      buscar_en_padron_externo: (input: unknown) => {
        const params = input as { lookup_key?: string; valor?: string };
        if (params.lookup_key === 'curp_beneficiario') {
          return mockPadronBeneficiario(params.valor ?? '');
        }
        return mockPadronResponsable(params.valor ?? '');
      },
      enviar_tramite_externo: (): SubmitResponse => ({
        ok: false,
        error:
          'El servidor del tramite respondio con un error interno (500). ' +
          'No es posible completar el tramite en este momento.',
        escalate: true,
      }),
      pedir_a_humano: () => ({
        status: 'notified',
        message:
          'Escalacion registrada. Un companero humano revisara el caso y contactara al ciudadano.',
      }),
    },
  },
];
