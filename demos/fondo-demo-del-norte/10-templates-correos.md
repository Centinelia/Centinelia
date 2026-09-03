# Templates de correo — Fondo Demo del Norte

## Template 1 — Solicitud mensual de Nara a los intermediarios

**De:** operaciones@fondodemodelnorte.mx (Nara, en nombre del Fondo)
**Para:** [tesorero]@[intermediario]
**Asunto:** Solicitud de reporte mensual de cartera — [Mes] [Año]

Estimado(a) [Nombre del tesorero],

Le escribo del área de operaciones del Fondo Demo del Norte para solicitarle formalmente el reporte mensual de cartera correspondiente al período de [mes] con corte al [último día del mes] de [año].

De acuerdo con las políticas del contrato marco, el envío debe realizarse dentro de los primeros 5 días hábiles del mes siguiente. En este caso, la fecha límite es el **[fecha límite]**.

Le recuerdo los campos que su reporte debe incluir:
- Saldo insoluto al cierre del período
- Cartera vencida desglosada por bucket (1-30, 31-60, 61-90, más de 90 días)
- Colocación del mes (nuevo crédito desembolsado)
- Cobranza del mes (capital + interés recibidos)
- Aforo actual y valor de garantías
- Estimaciones preventivas y cobertura
- Notas relevantes de tesorería (reestructuras, castigos, cambios de calificación)

Adjunto la plantilla estándar del Fondo por si le facilita el envío. Puede enviar en el formato interno de su institución si prefiere, siempre que incluya los campos anteriores.

Cualquier duda o solicitud de ampliación del plazo, favor de comunicarse conmigo al 811-502-8033 o responder este correo.

Quedo atenta a su envío.

Saludos cordiales,

**Nara — Coordinación Operativa**
Fondo Demo del Norte, SOFOM E.N.R.
Av. Ricardo Margáin 575, Torre Sur piso 12
San Pedro Garza García, NL
operaciones@fondodemodelnorte.mx | +52 811 502 8033

---

## Template 2 — Respuesta consolidada de Nova al equipo del Fondo

**De:** analisis@fondodemodelnorte.mx (Nova)
**Para:** [gerente_cartera]@fondodemodelnorte.mx
**Asunto:** Consolidado cartera [Intermediario] — [Mes] [Año] — [Estatus]

Ejecutivo,

Reporte recibido y procesado.

**Recepción**
- Intermediario: **[Nombre]** ([Figura])
- Período: **[Mes] [Año]**, corte al [fecha]
- Formato: [tipo de reporte detectado]

**Indicadores clave**
- Saldo insoluto: **$[X.XM]** (variación vs mes anterior: [±X.X%])
- Cartera vencida: **$[X.XM]** — IMOR **[X.X%]** (variación: [±XX bps])
- Aforo actual: **[X.XXx]** (política mínima 1.25x)
- Colocación del mes: $[X.XM]
- Cobranza del mes: $[X.XM]
- Cobertura de reservas: [X.X%]

**Cotejo con cartera maestra**
Con este movimiento, la cartera consolidada del Fondo queda en **$[XXX.XM]**. La concentración de este intermediario es **[XX.X%]** del total. IMOR ponderado del Fondo: **[X.XX%]**.

**Alertas detectadas**
[Listar solo las que aplican:]
- 🟡 Morosidad sube [XX bps] vs mes anterior — punto de atención.
- 🔴 Aforo cae debajo de política — refuerzo de garantías requerido en 5 días hábiles.
- 🔴 IMOR supera umbral interno de 5% — pasa a watch list.
- 🔴 Concentración individual supera 20% del total del Fondo — alerta al comité de crédito.

Si no hay alertas: "Sin señales de deterioro. Intermediario dentro de los umbrales de política."

**Acciones sugeridas**
[Solo si hay alertas:]
1. Contactar a tesorería del intermediario para [refuerzo/aclaración/plan de acción].
2. Incluir en la carpeta del próximo comité de riesgos.
3. Evaluar ajuste de línea o pricing.

**Adjunto**: `cartera-maestra-[fecha_corte].xlsx` — vista consolidada de los 7 intermediarios actualizada al cierre procesado.

Cualquier profundización adicional, escríbeme al chat.

**Nova — Consolidación y Análisis de Cartera**
Fondo Demo del Norte

---

## Template 3 — Nara confirma recepción de reporte al tesorero

**De:** operaciones@fondodemodelnorte.mx
**Para:** [tesorero]@[intermediario]
**Asunto:** Acuse de recepción — Reporte [Mes] [Año] — [Intermediario] — Folio [FOLIO]

Estimado(a) [Nombre del tesorero],

Confirmo la recepción de su reporte mensual de cartera correspondiente a [mes] [año], con corte al [fecha corte].

- Folio de expediente: **[FOLIO-YYMMDD-NNN]**
- Fecha de recepción: [fecha y hora]
- Canal: [correo / portal / entrega física]

El equipo de consolidación procesará su reporte en las próximas 24 horas y le enviaremos el acuse formal con las observaciones si las hubiere.

Le agradezco la puntualidad.

Saludos,

**Nara — Coordinación Operativa**
Fondo Demo del Norte

---

## Template 4 — Cobranza suave de Nico (5 días antes del vencimiento)

**Guion de llamada, NO correo. Se envía por Nico vía trigger_outbound_call.**

"Buenos días Ingeniero [Apellido], le habla Nico del Fondo Demo del Norte. Nada más para confirmar con usted que tienen fecha de pago programada el próximo [fecha] por un monto aproximado de $[X.XM]. ¿Todo listo por su parte para ese día?"

Escenarios:
- Confirma: "Perfecto, cualquier cosa quedo a la orden. Que tenga excelente día."
- Necesita cambio 1-3 días: "Entendido, registro el compromiso para el [nueva fecha]. Le agradezco el aviso."
- Necesita más días o hay problema: "Le agradezco la transparencia. Le paso el tema a Adriana Vela, nuestra directora de operaciones, para que revise con usted el plan. Le llamará en las próximas 24 horas."

---

## Template 5 — Cobranza formal de Nico (3+ días vencido)

**Guion de llamada, NO correo.**

"Buenos días Ingeniero [Apellido], le habla Nico del Fondo Demo del Norte. Le llamo por el pago programado del [fecha vencida] que aún no vemos reflejado en tesorería. ¿Nos puede confirmar cuándo se estaría refiriendo el pago?"

Escenarios:
- Ya se pagó: pide referencia y confirma que el equipo verifica. Pide que reenvíen comprobante a tesoreria@fondodemodelnorte.mx.
- Se paga hoy o mañana: registra compromiso, avisa que da seguimiento en 24-48h.
- Problema temporal: escucha, "en función del monto y del historial de su institución podríamos explorar una calendarización — no lo puedo confirmar yo, se lo paso a Adriana Vela para que lo revise con ustedes."
- Problema mayor: escala inmediatamente.
