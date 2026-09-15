# Propuesta ejecutiva — Nala facturista para IPark Estacionamientos

*Preparado por Centinelia · Septiembre 2026*

---

## El problema

IPark maneja aproximadamente **35,000 facturas mensuales** a través de InvoiceOne, su PAC actual. La mayoría de esos CFDIs se emiten sin intervención humana: clientes recurrentes con facturación automática, y viajeros que usan el portal público de autoservicio.

Sin embargo, **aproximadamente 1,000 correos al mes** llegan al inbox de facturación de IPark porque el cliente no supo, no pudo, o prefirió no usar el autoservicio. Cada uno de esos correos hoy lo resuelve una persona a mano: leer el mensaje, extraer los datos fiscales, meter la solicitud al sistema, timbrar el CFDI, responder al cliente con el comprobante adjunto.

**Estimado de tiempo humano:** 5-10 minutos por correo. Con 1,000 correos al mes, son **80 a 165 horas mensuales** dedicadas a un trabajo repetitivo, en su mayoría idéntico caso a caso.

## La propuesta

**Nala IPark**, una facturista digital de Centinelia conectada al inbox actual de facturación de IPark. Nala:

1. **Lee todos los correos entrantes** del inbox.
2. **Filtra con criterio estricto** — solo actúa sobre los que claramente piden factura. Los demás quedan intactos para el equipo humano.
3. **Extrae los datos fiscales** del correo (RFC, folio del boleto, uso CFDI, régimen, código postal).
4. **Timbra vía InvoiceOne API** bajo la cuenta actual de IPark, sin cambiar nada del stack fiscal.
5. **Responde al cliente** con el CFDI adjunto (XML+PDF) en el mismo hilo del correo, en el idioma en que le escribieron.
6. **Escala a humano** los casos que requieren criterio (RFC inexistente, mes vencido, solicitudes de corrección, boletos no encontrados).

Nala opera 24/7. No pide vacaciones. No se enferma. No se distrae.

## Lo que NO cambia

- **InvoiceOne sigue siendo el PAC.** Los 34,000 CFDIs autoservicio se timbran exactamente igual. Los 1,000 nuevos que Nala procesa también van vía InvoiceOne, bajo la cuenta de IPark.
- **El portal público de autoservicio se queda igual.** La mayoría de los clientes lo siguen usando.
- **El equipo humano actual no se despide.** Pasa de ejecutar 1,000 correos al mes a auditar Nala y atender los casos escalados (estimado 150-200 casos/mes).
- **La dirección de correo pública de IPark no cambia.** El setup se hace por reenvío desde el inbox actual.

## Alcance del POC — 30 días

- **Días 1-5:** setup técnico. IPark comparte credenciales InvoiceOne y activa reenvío del inbox de facturación hacia Centinelia. Centinelia calibra Nala con el contexto específico de IPark.
- **Días 6-20:** operación supervisada. Nala procesa correos en tiempo real. **Un humano de IPark audita cada respuesta antes de que salga al cliente.** Se ajusta el prompt y la lógica si algo sale mal.
- **Días 21-30:** operación directa. Nala responde sin intervención previa. Escalación automática a humano solo en casos que la propia Nala identifica como fuera de su criterio.
- **Día 30:** revisión de métricas.

## Métricas de éxito

- **% de correos resueltos por Nala sin escalar** (objetivo: 80%+)
- **Tiempo promedio desde recepción hasta respuesta al cliente** (objetivo: <5 min)
- **Horas humanas ahorradas al mes** (comparativo baseline vs Nala)
- **Casos de facturación mal emitidos** (objetivo: 0)
- **Satisfacción del cliente que interactúa con Nala** (encuesta corta al cerrar el ticket)

## Inversión

**POC 30 días — costo simbólico:** MXN $3,000 - 5,000. Cubre el setup técnico, la calibración del prompt, y la operación supervisada. No incluye la mensualidad de operación estable posterior.

**Operación mensual post-POC:** se cotiza con base en las métricas reales del POC. Rango de referencia para volumen similar (1,000 correos/mes): **MXN $9,000 - 14,000/mes**. Ancla comparativa: si hoy una persona dedica 20-30 horas mensuales a este trabajo, el salario prorrateado ya supera este rango.

**No hay costo de licencias de software adicional.** InvoiceOne sigue siendo pagado directamente por IPark bajo su cuenta actual.

## Siguientes pasos concretos

1. **Confirmación de interés** por parte del equipo IPark (esta semana o la próxima).
2. **Firma de acuerdo POC** — documento corto de 1 página, sin candados ni compromiso de continuidad post-POC.
3. **Kickoff técnico** — Centinelia recibe credenciales InvoiceOne EasyOne + acceso al inbox de facturación por reenvío.
4. **Arranque del POC** — 3-5 días laborales después del kickoff.

## Sobre Centinelia

Centinelia opera empleados digitales para PYMEs y organizaciones medianas en México, con foco en Monterrey. Actualmente atiende clientes en industrias como tortillería, servicios profesionales, inmobiliaria, y servicios de aire acondicionado, entre otros. Cada empleado digital (llamado "meerkat") tiene un rol específico y trabaja dentro de la operación del cliente con las mismas herramientas y accesos que tendría un empleado humano.

Nala es el meerkat especialista en facturación fiscal. Actualmente opera con integraciones probadas contra CONTPAQi Comercial Pro, Facturama, y ahora InvoiceOne EasyOne.

---

**Contacto:** Nazre Aguilar · nazre20@gmail.com · Centinelia · Monterrey, Nuevo León
