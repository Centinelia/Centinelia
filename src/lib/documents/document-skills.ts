export function getDocumentSkill(format: string, templateType?: string): string {
  if (format === 'powerpoint') return POWERPOINT_SKILL;
  if (format === 'excel')      return EXCEL_SKILL;
  const t = templateType ?? 'general';
  if (t === 'proposal') return PROPOSAL_SKILL;
  if (t === 'letter')   return LETTER_SKILL;
  return GENERAL_SKILL;
}

export function isCriticalDocument(format: string, templateType?: string): boolean {
  if (format === 'powerpoint') return true;
  if (format === 'excel')      return false;
  const t = templateType ?? 'general';
  return t === 'proposal' || t === 'letter';
}

const PROPOSAL_SKILL = `ESTÁNDARES DE PROPUESTA PROFESIONAL:
- Estructura obligatoria: Resumen ejecutivo → Problema del cliente → Solución propuesta → Metodología o entregables → Inversión y precio → Vigencia → CTA.
- Personalización: Usa el nombre del cliente y su problema específico. Sin texto genérico copiado.
- Cuantifica: "Reducirás el tiempo de procesamiento 40%" en lugar de "mejorarás tu proceso". Si no tienes el dato exacto, usa un rango realista o evidencia del sector.
- Precio: Destacado y claro. Incluye qué está incluido y qué NO está incluido. Sin ambigüedades.
- Tono: Profesional y cálido. Primera persona del plural del negocio ("En [Negocio] hacemos...").
- CTA final: Específico y accionable ("Confirma antes del [fecha]" o "Agenda una llamada esta semana").
- Evita: Clichés como "soluciones integrales", "de primer nivel", "líderes del sector", "nos distinguimos por nuestra calidad".
- Longitud: Suficiente para convencer, no para impresionar. Cada párrafo debe ganar su lugar.`;

const LETTER_SKILL = `ESTÁNDARES DE CARTA FORMAL:
- Apertura: Saludo formal con nombre completo del destinatario ("Estimado Ing. García:" o "Estimada Lic. Ramírez:"). Nunca "A quien corresponda".
- Primera oración: Expone el motivo sin rodeos ni preámbulos.
- Cuerpo: Máximo 3 párrafos. Cada párrafo un solo punto. Párrafos de máximo 5 líneas.
- Tono: Formal, directo, respetuoso. Sin argot ni contracciones coloquiales.
- Cierre: Fórmula de despedida formal ("Atentamente," o "Quedo a sus órdenes,") seguida de firma completa (nombre, cargo, negocio, teléfono, correo).
- Formato: Fecha arriba a la derecha, datos del destinatario completos, asunto o referencia si aplica.
- Evita completamente: "Por medio de la presente me es grato comunicarle", "Sin otro particular", párrafos de más de 5 líneas.`;

const GENERAL_SKILL = `ESTÁNDARES DE DOCUMENTO GENERAL:
- Título claro y descriptivo de lo que contiene el documento.
- Estructura lógica con secciones tituladas y jerarquía clara (# sección, ## subsección).
- Párrafos cortos (3-5 líneas máximo). Una idea por párrafo.
- Lenguaje preciso: elimina redundancias, relleno y frases sin información.
- Sección de conclusiones o siguientes pasos al final cuando corresponda.
- Fechas, nombres y cifras completos cuando se referencien.
- Tono coherente y profesional de principio a fin.`;

const EXCEL_SKILL = `ESTÁNDARES DE HOJA DE CÁLCULO:
- Headers: específicos y en Title Case. Nunca abreviados sin estándar (RFC e IVA están bien, "Desc." no).
- Una sola categoría de dato por columna. Tipos consistentes en toda la columna (no mezclar texto y números).
- Fechas: formato DD/MMM/YYYY (01/Jul/2026) para legibilidad en México.
- Moneda: incluir símbolo "$" o indicar "MXN" en el header de la columna.
- Filas de totales al final cuando hay datos numéricos. Subtotales por sección en datasets grandes.
- Sin celdas combinadas en datos. Solo permitido en títulos de sección decorativos.
- Hojas separadas para datasets distintos. Nombre de cada hoja: descriptivo y corto.
- Orden lógico: cronológico, alfabético o por importancia descendente.
- Datos representativos y reales, no placeholders como "Ejemplo 1" o "Valor X".`;

const POWERPOINT_SKILL = `ESTÁNDARES DE PRESENTACIÓN PROFESIONAL:
- Título de diapositiva: afirmación o conclusión (¿Qué aprendes al leer el título?), nunca solo una etiqueta.
  MAL: "Resultados de ventas" | BIEN: "Ventas crecen 28% frente al año anterior"
- Máximo 5-6 bullets por diapositiva. Si necesitas más, divide en dos diapositivas.
- Una idea central por diapositiva. Si toca dos temas, son dos diapositivas.
- Bullets: frases cortas (7-10 palabras), paralelas entre sí en estructura gramatical, comienzan con verbo o dato.
- Sin párrafos de texto en el cuerpo. Si el contenido requiere prosa, va en las notas del presentador.
- Notas del presentador: amplían lo que está en la diapositiva. 2-4 oraciones por nota.
- Flujo narrativo: cada diapositiva conecta lógicamente con la siguiente. La presentación cuenta una historia.
- Primera diapositiva de contenido: contexto, agenda o pregunta que la presentación responde.
- Última diapositiva: conclusión clara y próximos pasos o CTA específico.
- Datos: siempre contextualizados ("28% vs año anterior", no solo "28%").`;
