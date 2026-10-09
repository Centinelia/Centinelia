# Fixtures — correos demo para bandeja Nala IPark

16 correos representativos que se cargan en la bandeja de la org demo antes de la llamada. Cubren el mix real que enfrentaría Nala en producción. Se muestran en pantalla durante la demo para enseñar cómo Nala decide qué abrir, qué ignorar, y cómo responde.

**Distribución:**
- Correos #1-5: cobertura original (completo, incompleto, RFC inválido, inglés, mes vencido)
- Correos #6-10: ignorar o escalar (queja, marketing, notificación, re-envío, corrección)
- Correos #11-16: casos edge que el layout C1 va a tocar (público en general, nota crédito, múltiples boletos, correo entrega distinto, pre-pago, duplicado)

Resultado neto:
- 11 correos → Nala procesa, responde o escala
- 5 correos → Nala ignora (no son de facturación)

Ratio no representativo del mundo real (donde 80%+ es no-facturación), sino calibrado para que la demo muestre todas las categorías de acción de Nala en 20 minutos. En producción real la proporción se invierte.

---

## Correo #1 — Facturación completa, en español

**De:** `laura.morales@grupomex.com.mx`
**Asunto:** Solicitud de factura estancia MTY

Hola, buen día.

Estuve en IPark del aeropuerto de Monterrey del 3 al 6 de septiembre. Anexo el ticket de salida (folio 2087341). Le pido de favor emitir factura con los siguientes datos:

- RFC: GME150312J78
- Razón social: Grupo Mex Consultores SC
- Régimen fiscal: 601
- Uso CFDI: G03
- Código postal: 66220

Gracias, quedo pendiente.

Saludos,
Laura Morales
Grupo Mex Consultores

**Acción esperada de Nala:** timbra directo, responde con XML+PDF.

---

## Correo #2 — Facturación incompleta (falta uso CFDI y CP)

**De:** `hector.villareal@outlook.com`
**Asunto:** Factura

Buen día,

Necesito la factura de mi estancia del fin de semana pasado. Folio del boleto: 2091008.

Datos:
- RFC: VIRH880203MN2
- Nombre: Héctor Villarreal

Gracias.

**Acción esperada de Nala:** responde pidiendo régimen fiscal, uso CFDI y CP. No timbra a medias.

---

## Correo #3 — RFC mal escrito (no existe en SAT)

**De:** `mfernandez@bufete-mx.mx`
**Asunto:** Facturación estacionamiento

Buenas tardes,

Adjunto ticket para facturar. Datos:
- RFC: BUM-091510-XL3
- Razón social: Bufete Fernández y Asociados
- Régimen: 601
- Uso: G03
- CP: 64000
- Folio boleto: 2098772

Saludos,
M. Fernández

**Acción esperada de Nala:** identifica que el RFC no tiene formato válido (guiones y estructura mal). Responde pidiendo confirmación o constancia fiscal. No timbra.

---

## Correo #4 — En inglés (viajero internacional)

**De:** `robert.chen@meridian-partners.com`
**Asunto:** Tax invoice for parking

Hi,

I parked at IPark MTY airport from Aug 28 to Sep 2 (ticket folio 2081204). Could you please issue the tax invoice (CFDI) with the following details:

- RFC: MEP180415UR9
- Nombre / Legal name: Meridian Partners Mexico SA de CV
- Régimen fiscal: 601
- Uso CFDI: G03
- Código postal: 06500

Thanks,
Robert Chen

**Acción esperada de Nala:** timbra directo, responde en INGLÉS con XML+PDF adjuntos.

---

## Correo #5 — Cliente perdió boleto, mes vencido

**De:** `patricia.moreno@gmail.com`
**Asunto:** Ayuda con factura

Hola,

Estuve en su estacionamiento de MTY hace como 6 semanas más o menos, dejé mi carro para un viaje a Europa. Pagué como $2,400 pesos. Perdí el boleto que me dieron pero necesito la factura para mi contabilidad. ¿Cómo lo hacemos?

Datos: RFC MOPP810725TL2, régimen 605, uso G03, CP 66240.

Gracias.

**Acción esperada de Nala:** escala a humano. Mes vencido + boleto perdido. Responde al cliente diciendo que va a verificar con el equipo y le responde hoy.

---

## Correo #6 — IGNORAR — Queja operativa (no facturación)

**De:** `arturo.gomez@yahoo.com.mx`
**Asunto:** Rayón en mi carro

Buenas tardes,

Ayer recogí mi vehículo del IPark Monterrey (boleto 2099102) y al llegar a mi casa noté un rayón en la puerta del copiloto que definitivamente no estaba cuando dejé el auto. Necesito reportar esto formalmente y saber qué proceso siguen para daños en el estacionamiento.

Adjunto foto del daño.

Espero pronta respuesta.
Arturo Gómez

**Acción esperada de Nala:** IGNORA. Deja el correo intacto en la bandeja. Es queja operativa, no facturación.

---

## Correo #7 — IGNORAR — Marketing/venta entrante

**De:** `ventas@mejoresprecios-limpieza.com`
**Asunto:** Cotización servicio de limpieza para su estacionamiento

Estimados,

Somos una empresa especializada en limpieza y mantenimiento de estacionamientos. Nos gustaría enviarles una propuesta comercial adaptada a las necesidades específicas de IPark. Adjunto brochure y quedamos a sus órdenes para agendar una cita.

Saludos cordiales,
Rafael Ochoa
Ventas

**Acción esperada de Nala:** IGNORA. Es prospección comercial entrante.

---

## Correo #8 — IGNORAR — Notificación automática de proveedor

**De:** `notificaciones@bancomer.com`
**Asunto:** Estado de cuenta disponible

Estimado cliente,

Le informamos que su estado de cuenta del mes de agosto ya se encuentra disponible en su portal de Banca en Línea. Ingrese a bbva.mx para consultarlo.

Este es un mensaje automático, favor de no responder.

BBVA México

**Acción esperada de Nala:** IGNORA. Notificación automática de banco.

---

## Correo #9 — Re-envío de factura (ya emitida)

**De:** `contabilidad@techmex.mx`
**Asunto:** Re-envío de factura extraviada

Hola equipo,

El mes pasado nos generaron una factura por el estacionamiento del director general (RFC TME140628PQ1). Necesitamos que nos la reenvíen porque no la encontramos en nuestro sistema. El folio del boleto fue el 2074511.

Gracias,
Contabilidad TechMex

**Acción esperada de Nala:** busca en el sistema por RFC + folio. Si la encuentra, reenvía. Si no, escala.

---

## Correo #10 — Corrección de factura ya emitida

**De:** `admin@constructoralm.com.mx`
**Asunto:** Error en factura emitida

Buen día,

La factura que nos generaron ayer (UUID F8A7C2B1-4E9D-4A2F-9C1B-88AA33BB44CC) tiene mal el régimen fiscal — quedó como 601 y debe ser 603. ¿Pueden corregirla?

Saludos,
Admin Constructora LM

**Acción esperada de Nala:** NO cancela por su cuenta. Escala a humano con detalle. Responde al cliente confirmando que va a coordinarlo hoy.

---

## Correo #11 — Público en general (sin RFC)

**De:** `jose.hernandez@gmail.com`
**Asunto:** Factura por mi estacionamiento

Buen día,

Dejé mi auto en IPark MTY la semana pasada y quiero pedir mi factura. No tengo RFC propio, soy persona física sin actividad empresarial. ¿Pueden hacerla a nombre de público en general? Folio del boleto: 2104892.

Gracias.
José Hernández

**Acción esperada de Nala:** aplica caso especial "PÚBLICO EN GENERAL". Timbra con RFC XAXX010101000, razón social PUBLICO EN GENERAL, régimen 616, uso S01, CP del emisor. En la respuesta avisa al cliente que esa factura no sirve para deducir y le pregunta si prefiere datos fiscales reales.

---

## Correo #12 — Nota de crédito (cliente dice que le cobraron de más)

**De:** `patricia.luna@consultoresjl.com`
**Asunto:** Error de cobro en estancia MTY

Buenas tardes,

El 20 de septiembre dejé mi auto en IPark MTY y lo recogí el 23 (3 días). Al salir me cobraron por 5 días cuando solo fueron 3. Ya tengo la factura emitida (UUID 4F2E8A1B-9D3C-4A7F-B2E1-77CC88DD99EE) por el monto incorrecto. Necesito que me emitan la nota de crédito por los 2 días de más y me reembolsen la diferencia.

Datos fiscales para la nota de crédito:
- RFC: CJL180815KS4
- Razón social: Consultores JL SA de CV
- Régimen: 601
- Uso: G03
- CP: 66220

Quedo pendiente.
Patricia Luna

**Acción esperada de Nala:** NO timbra la nota de crédito por su cuenta. Escala a humano con todo el detalle (UUID original, monto a acreditar, fechas correctas vs. cobradas, datos del cliente). Responde al cliente: "Recibí su solicitud de nota de crédito. Voy a coordinarlo con el equipo de facturación hoy mismo y le confirmo antes de cierre."

---

## Correo #13 — Múltiples boletos en el mismo correo

**De:** `tesoreria@grupoindustrial.mx`
**Asunto:** Facturación consolidada 3 estancias septiembre

Hola,

Nuestro director tuvo 3 viajes en septiembre y necesitamos facturar las 3 estancias en IPark MTY. Les comparto los folios y datos fiscales:

Folios: 2089115, 2093440, 2098772
Fechas aproximadas: 1-3 sept, 10-12 sept, 22-25 sept

Datos para los 3 CFDIs:
- RFC: GIN150820RM3
- Razón social: Grupo Industrial del Norte SA de CV
- Régimen: 601
- Uso: G03
- CP: 64000

¿Pueden enviarlas por separado o en una sola si es posible?

Gracias.
Tesorería

**Acción esperada de Nala:** regla a definir con IPark (preguntar en kickoff si 1 CFDI con N conceptos o N CFDIs separados). Mientras tanto, default: emite 3 CFDIs separados (uno por folio), uno por correo de respuesta, mismo destinatario. Si prefieren consolidado, lo pregunta explícitamente al cliente antes de timbrar.

---

## Correo #14 — Asistente ejecutiva (correo de entrega distinto)

**De:** `ana.rodriguez@grupomex.com.mx`
**Asunto:** Factura para el Lic. Mendoza

Buenas tardes,

Soy la asistente del Lic. Carlos Mendoza. Él viajó la semana pasada y dejó su auto en IPark MTY (folio 2101223). Les pido de favor que la factura la envíen directamente a él, no a mí, al correo cmendoza@grupomex.com.mx. A mí me pueden poner en copia.

Datos fiscales (son los de la empresa):
- RFC: GME150312J78
- Razón social: Grupo Mex Consultores SC
- Régimen: 601
- Uso: G03
- CP: 66220

Gracias.
Ana Rodríguez
Asistente Dirección General

**Acción esperada de Nala:** timbra directo. En el envío de respuesta, destinatario = cmendoza@grupomex.com.mx, en copia (CC) ana.rodriguez@grupomex.com.mx. Mensaje breve que mencione a ambos: "Lic. Mendoza, aquí su factura. Ana, en copia por su control."

---

## Correo #15 — Cliente escribió antes del pago

**De:** `fernando.cantu@startupmx.io`
**Asunto:** Factura próxima estancia

Hola, buenas tardes.

Estoy en el aeropuerto de Monterrey ahora mismo, acabo de dejar mi auto en IPark para un viaje a Guadalajara. Regreso el jueves. Quiero adelantarles los datos para que me manden la factura directo cuando regrese y pague.

Boleto: 2110887 (acabo de entrar)
RFC: CAFE880912TY5
Razón social: Fernando Cantú (persona física)
Régimen: 612
Uso: G03
CP: 66260

Gracias.
Fernando

**Acción esperada de Nala:** NO timbra todavía (no hay cobro final). Responde: "La factura se genera al momento del pago. En cuanto salga del estacionamiento el jueves, el cobro queda registrado y le llega la factura automáticamente al correo que me compartió. No necesita hacer nada más. Guardo sus datos fiscales para que estén aplicados al momento del cobro." Marca el request como "pendiente de pago" para que el pipeline lo retome cuando el folio tenga importe final.

---

## Correo #16 — Correo duplicado (dedup esperado)

**De:** `laura.morales@grupomex.com.mx`
**Asunto:** Re: Solicitud de factura estancia MTY

Hola,

Hace unas horas les pedí la factura por mi estancia (del 3 al 6 de septiembre, folio 2087341) con los datos de Grupo Mex Consultores. ¿Pueden confirmar si ya quedó? No he recibido el XML.

Gracias,
Laura

**Acción esperada de Nala:** detecta que el folio 2087341 YA fue procesado por Nala en el correo #1 (misma Laura, mismo folio). NO vuelve a timbrar. Responde: "Hola Laura, la factura ya quedó timbrada hace [X horas] y se le envió al correo laura.morales@grupomex.com.mx con UUID [UUID]. Si no le llegó, se la reenvío ahora mismo." Si confirma que no la recibió, reenvía la misma, no genera otra.

---

## Nota para provisionar la bandeja

Cada correo se inserta como fila en la tabla `email_inbox_items` (o equivalente) del org demo `ipark-demo`, con:
- `from_email` — según arriba
- `subject` — según arriba
- `body` — texto completo (sin adjunto real; se puede simular con un placeholder si el UI lo requiere)
- `received_at` — fechados últimas 24-48h para que se vean recientes en la demo
- `status` — `pending_review` para todos

Nala procesa cada uno según el pipeline `inbox-processor.ts` y sus decisiones (procesar vs ignorar) se muestran en pantalla en tiempo real.
