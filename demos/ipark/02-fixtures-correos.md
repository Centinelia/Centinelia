# Fixtures — correos demo para bandeja Nala IPark

10 correos representativos que se cargan en la bandeja de la org demo antes de la llamada. Cubren el mix real que enfrentaría Nala en producción. Se muestran en pantalla durante la demo para enseñar cómo Nala decide qué abrir, qué ignorar, y cómo responde.

**Distribución objetivo:**
- 5 correos → Nala procesa (con o sin info completa)
- 5 correos → Nala ignora (no son de facturación)

Ratio no representativo del mundo real (donde 80%+ es no-facturación), sino calibrado para que la demo muestre las 5 categorías de acción de Nala en 20 minutos. En producción real la proporción se invierte.

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

## Nota para provisionar la bandeja

Cada correo se inserta como fila en la tabla `email_inbox_items` (o equivalente) del org demo `ipark-demo`, con:
- `from_email` — según arriba
- `subject` — según arriba
- `body` — texto completo (sin adjunto real; se puede simular con un placeholder si el UI lo requiere)
- `received_at` — fechados últimas 24-48h para que se vean recientes en la demo
- `status` — `pending_review` para todos

Nala procesa cada uno según el pipeline `inbox-processor.ts` y sus decisiones (procesar vs ignorar) se muestran en pantalla en tiempo real.
