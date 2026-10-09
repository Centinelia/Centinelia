# Propuesta comercial — Automatización de facturación por correo IPark Estacionamientos

Documento base para compartir con Americo Medina (IPark/Embia) después o durante la reunión del lunes 2026-10-05 si surge la conversación de precios. Ajustable según cómo se defina el scope final del endpoint y las responsabilidades técnicas de IPark vs. Centinelia.

Fecha: 2026-10-02
Vigencia de la propuesta: 30 días naturales
Emisor: Centinelia (Nazre Assad)
Receptor propuesto: IPark Estacionamientos, representado por Americo Medina (Embia)

---

## Resumen ejecutivo

Centinelia propone automatizar el canal de facturación por correo de IPark Estacionamientos mediante Nala, un empleado digital que lee el inbox de facturación, extrae datos fiscales del correo del cliente, timbra el CFDI vía el Conector C1 de InvoiceOne (que IPark ya opera), y responde al cliente con el XML y PDF correspondientes.

Volumen base estimado (confirmado por Francisco Chapa en septiembre 2026): aproximadamente 1,000 correos de facturación por mes en la red actual de IPark. La propuesta cubre esa capacidad desde el día 1, con proyección de escalamiento hasta 15,000 correos por mes conforme IPark expande sucursales.

### Totales

**Fase POC (3 meses de operación):**

| Componente | Precio MXN | Pago |
|---|---|---|
| Desarrollo del adapter Conector C1 (integración con endpoint IPark) | $150,000 | 50% al kickoff, 50% al primer timbrado en producción |
| Setup / contratación / onboarding | $14,990 | Al kickoff |
| Mensualidad Nala IPark Jornada Tareas - Alta Demanda (3 meses × $11,988) | $35,964 | Mensual |
| **Total Fase POC** | **$200,954** | |

**Mensualidad Fase Productiva (mes 4 en adelante):** $11,988 MXN si el consumo real se mantiene bajo 3,000 ops/mes. Si rebasa recurrentemente, migramos a tier Empresarial (cotización custom al momento). Ver sección "Mensualidad y escalamiento" abajo.

---

## 1. Desarrollo del adapter Conector C1

Trabajo one-time que Centinelia realiza para integrar Nala con el flujo del Conector C1 de IPark.

### Scope técnico

- Diseño del contrato JSON del request (acordado con equipo de desarrollo de IPark en la reunión del 2026-10-05)
- Builder del TXT layout C1 según las especificaciones oficiales de InvoiceOne (archivos LC1-CFDI40, LC1-Pagos20, LC1-CFDI40E-NotasdeCredito), con soporte para los 4 patrones principales:
  - CFDI 4.0 Ingreso estándar (facturación normal)
  - CFDI 4.0 Egreso con CFDI_RELACION (notas de crédito)
  - CFDI con receptor "Público en general" (XAXX010101000)
  - CFDI con receptor extranjero (XEXX010101000)
- Cliente HTTPS para postear requests al endpoint que IPark construye frente al Conector
- Handler de respuestas con parseo de XML y PDF (base64), manejo de errores y mapeo de `.error.txt` del Conector a códigos semánticos
- Lógica de idempotencia: hash SHA-256 determinístico del contenido fiscal para prevenir doble timbrado en caso de reintento (ya diseñada y validada con 12 tests, ver `tests/lib/invoicing/c1-idempotency-design.test.ts`)
- Pre-flight validation CFDI 4.0: verifica RFC, régimen fiscal, uso CFDI, montos positivos, catálogos SAT antes de enviar al endpoint IPark
- Tests end-to-end contra el ambiente sandbox de InvoiceOne (400 timbres gratis incluidos por InvoiceOne)
- Documentación operativa y runbook para IPark (manejo de incidencias, reintentos, consulta de estado)

### Estimación de horas

Aproximadamente 100 horas de desarrollo senior fullstack con experiencia en PACs mexicanos (Facturama, Solución Factible, InvoiceOne). Costo paquete fijo: **$150,000 MXN**.

### Esquema de pago

- 50% al kickoff ($75,000 MXN) tras firma de la propuesta y confirmación del contrato JSON con el equipo de IPark.
- 50% al primer timbrado real en producción ($75,000 MXN).

### Entregables

- Código integrado en el repositorio de Centinelia bajo `src/lib/invoicing/invoiceone/c1-connector/`
- Suite de tests que valida el formato TXT contra los 3 ejemplos oficiales del PDF layout de InvoiceOne
- Documentación técnica del contrato endpoint JSON acordado con IPark
- Runbook operativo (qué hacer si el conector falla, cómo revisar timbres pendientes, cómo reintentar)

---

## 2. Setup / contratación / onboarding

Trabajo one-time de configuración del ambiente productivo.

Incluye:
- Alta de la organización IPark en el portal Centinelia
- Configuración del inbox de facturación de IPark con reenvío automático a Nala
- Alta de Nala con el prompt específico de IPark (ya diseñado, con 11 secciones de protocolo + casos edge)
- Configuración del endpoint IPark en credenciales de la organización
- Alta de la Serie fiscal reservada (`CEN` u otra que IPark prefiera) con el rango de folios acordado
- Pruebas de humo con los 16 fixtures del demo antes de arrancar operación real
- Capacitación al punto de contacto de IPark (1 sesión de 60 minutos) sobre cómo monitorear la bandeja de Nala, consultar estado de timbrados y escalar casos
- Primer mes de monitoreo activo por el equipo técnico de Centinelia (horario laboral)

Costo: **$14,990 MXN**, pagadero al kickoff.

---

## 3. Mensualidad Nala IPark

Modelo work-based: Nala cobra por acción de negocio ejecutada (una "op" o tarea). Cada timbrado exitoso, cada respuesta al cliente, cada escalación a humano cuenta como 1 op.

### Estimación de consumo mensual

Para el volumen base de 1,000 correos de facturación por mes:

| Tipo de op | Cantidad estimada por mes |
|---|---|
| Timbrados exitosos (CFDI emitido) | 850 |
| Respuestas automáticas al cliente final (envío de XML+PDF) | 850 |
| Respuestas pidiendo info faltante (RFC incompleto, régimen, etc.) | 100 |
| Escalaciones a humano (casos ambiguos, correcciones, re-envíos) | 150 |
| Reintentos y clarificaciones (segundo correo del cliente) | 100 |
| **Total ops mensuales estimadas** | **~2,050 - 2,500 ops** |

### Plan recomendado para IPark

**Jornada Tareas - Alta Demanda** del catálogo estándar Centinelia:

- 3,000 tareas (ops) incluidas por mes
- Precio base: **$11,988 MXN mensuales**
- No incluye minutos de voz (Nala IPark es solo email, no requiere llamadas)
- Fuente del catálogo: `src/lib/billing/plans.ts` tier `scale` jornada `tareas`

El estimado de consumo de IPark (2,050-2,500 ops) cabe cómodamente dentro de 3,000 con margen de ~500-900 ops de holgura al mes.

### Overage (cuando se exceden las 3,000 ops incluidas)

Si en algún mes se pasan de 3,000 ops, Centinelia tiene mecanismo de compra puntual de tareas adicionales vía el portal del cliente:

| Paquete | Precio pre-IVA | Precio con IVA | Costo efectivo por op |
|---|---|---|---|
| 100 ops | $800 | $928 | $9.28 |
| 300 ops | $2,100 | $2,436 | $8.12 |
| Cualquier otra cantidad | $8.5 por op | $9.86 por op | $9.86 |

El overage no se dispara automáticamente. Cuando el pool se acerca al límite, Centinelia notifica al punto de contacto de IPark para decidir si comprar más tareas o pausar hasta el reset mensual.

### Mensualidad Fase Productiva (mes 4+)

Dos escenarios según lo que arroje el consumo real durante el POC:

**Escenario A — consumo estable bajo 3,000 ops/mes:** se mantiene Jornada Tareas Alta Demanda a **$11,988 MXN/mes**. Sin cambio.

**Escenario B — consumo recurrente arriba de 3,000 ops/mes (ej. IPark escala a nuevas sucursales):** migramos a tier **Empresarial** del catálogo (`src/lib/billing/plans.ts` tier `enterprise`), que es custom por volumen. Se emite nueva cotización en ese momento con precio proporcional al rango de ops real. Rango estimado: $18,000 a $35,000 MXN/mes para 4,000 a 10,000 ops/mes. Negociable con descuento por volumen.

### Qué incluye la mensualidad

- Nala operando 24/7 sobre el inbox de facturación de IPark
- Todos los timbrados vía el endpoint IPark (los timbres los paga IPark directo a InvoiceOne con su bolsa existente, Centinelia no es intermediario)
- Respuestas automáticas al cliente final en español e inglés
- Panel de monitoreo en el portal Centinelia con métricas en tiempo real (timbrados por hora, errores, escalaciones pendientes)
- Reportes semanales por correo al punto de contacto de IPark con resumen operativo
- Soporte técnico primera línea en horario laboral MX (L-V 9am-7pm) con tiempo de respuesta objetivo de 2h
- Mantenimiento del adapter conforme InvoiceOne actualice el layout C1 o SAT cambie el estándar CFDI

### Qué NO incluye

- Costo de los timbres fiscales en EasyOne (IPark los paga directo a InvoiceOne, Centinelia no revende timbres)
- Modificaciones mayores al scope (ej. agregar un nuevo PAC, integrar con otro ERP de IPark, nueva razón social). Estas son change requests cotizadas aparte.
- Operación de soporte fuera de horario laboral (disponible como add-on con tarifa de guardia)

---

## Proyección de retorno (orden de magnitud, basado en información compartida por IPark)

Para que IPark pueda poner los números en contexto. Supuestos conservadores a partir de las conversaciones con Americo y Francisco.

### Lo que IPark gasta hoy (estimado)

Resolver manualmente 1,000 correos de facturación al mes equivale aproximadamente a:
- 1 persona dedicada tiempo completo (facturadora junior-media)
- Costo mensual promedio en MTY con prestaciones: $18,000 - $25,000 MXN
- Más: tiempo supervisor, errores que escalan, retrabajos, clientes molestos esperando respuesta

Costo estimado del proceso manual actual: entre $20,000 y $30,000 MXN mensuales para IPark.

### Lo que paga con Centinelia

Mensualidad POC: $11,988 MXN. **Entre 40% y 60% más barato que el costo actual del proceso manual**, con ventajas operativas adicionales:
- Respuesta al cliente final en segundos vs. horas o días
- Operación 24/7 sin ventanas de ausencia por vacaciones, incapacidades, rotación
- Métricas de calidad en tiempo real auditables
- Escalabilidad sin crecimiento proporcional del equipo humano (duplicar volumen no duplica el costo)
- La persona que hoy vive respondiendo correos queda liberada para auditar, mejorar el proceso y atender casos complejos de criterio

### Punto de equilibrio

El desarrollo one-time + setup ($164,990 MXN) se recupera en aproximadamente **9-12 meses de operación** comparado contra el costo del proceso manual actual, asumiendo que IPark reasigna o reduce el equipo humano actual al liberarse del volumen rutinario. Si IPark escala a más sucursales durante ese periodo, el punto de equilibrio se acorta porque el costo marginal por correo adicional es muy bajo (overage de $8-10 MXN por op).

---

## Alternativa B: estructura escalonada sin pago inicial fuerte

Para IPark si prefiere no desembolsar los $150K de desarrollo al inicio:

- Setup: $14,990 MXN al kickoff
- Desarrollo: diluido en los primeros 6 meses como recargo al mensualidad, +$25,000 MXN/mes durante 6 meses = $150,000 MXN totales
- Mensualidad base: $11,988 MXN desde el mes 1 (Jornada Tareas Alta Demanda)
- Mensualidad efectiva primeros 6 meses: $36,988 MXN
- Mensualidad post-mes 6: $11,988 MXN (o según tier productivo)

Ventaja: reduce la barrera de entrada inicial de $150K a $14,990. Desventaja: paga ligeramente más en total ($150K vs ~$145K neto por tasa de descuento implícita).

---

## Opción 0: POC mínimo de validación (ruta de bajo riesgo)

Para IPark si prefiere validar que Nala realmente funciona con sus correos reales **antes** de comprometer dev de ambos lados al proyecto completo. Reduce drásticamente el riesgo inicial.

### Alcance

- IPark configura un alias de correo de pruebas (ej. `pruebas-centinelia@ipark.com.mx`) que reenvía automáticamente a `ipark-demo@centinelia.mx`. Entre 50 y 100 correos reales de facturación llegan a Nala durante el POC.
- Nala procesa cada correo: decide si es facturación o no, extrae datos fiscales, redacta respuesta al cliente final.
- Nala **NO timbra realmente**. En lugar de generar un CFDI real, marca cada request como "listo para timbrar — enviaría estos datos al endpoint IPark". IPark no tiene que construir nada, no se tocan sus sistemas fiscales, no se emiten CFDIs reales a clientes.
- Centinelia produce reporte semanal con datos reales: volumen procesado, precisión de extracción (RFC válidos, régimen correcto, CP válido), % de escalación a humano, calidad de respuestas generadas, casos edge detectados.
- Al final de las 2 semanas, reunión de resultados con IPark para decidir con datos reales si vale la pena continuar al proyecto completo.

### Qué se demuestra con esto

- Si Nala puede extraer correctamente datos fiscales de los correos reales de IPark (precisión medible)
- Si el prompt y la lógica de decisión son adecuados o requieren ajustes
- Si los casos edge que diseñamos cubren la realidad del volumen de IPark
- Si el modelo de "Nala responde solicitando lo faltante" realmente funciona con clientes reales que escriben mal, incompleto, o informal
- Costo real por correo procesado medido en consumo de ops

### Qué NO se construye en el POC

- Adapter real del Conector C1 (eso queda para el proyecto completo)
- Endpoint HTTPS de IPark (no se requiere, nada se timbra realmente)
- Integración productiva con InvoiceOne

### Costo

**$45,000 MXN one-time**, cubre:
- Setup y provisionamiento de la organización IPark en Centinelia (incluido)
- Afinación del prompt Nala con los primeros correos reales
- Panel de observabilidad en el portal Centinelia donde IPark puede ver cada correo procesado en tiempo real
- Reportes semanales automatizados por correo
- Soporte técnico durante las 2-3 semanas del POC
- Reunión final de resultados + recomendación de siguiente paso

### Timeline

- **Semana 0:** IPark configura alias de forwarding + nos manda primeros 10-20 correos de muestra
- **Semana 1:** Nala corre, iterativamente afinamos prompt. Primer reporte parcial a IPark.
- **Semana 2:** Nala estabilizada, medición de precisión final.
- **Semana 3:** Reunión de resultados + decisión go/no-go.

### Qué pasa después del POC

Dos escenarios:

**Si deciden continuar al proyecto completo:** los $45,000 del POC se acreditan contra el costo del desarrollo del adapter real ($150,000 → **$105,000 netos**). Setup del POC se reutiliza, no se cobra de nuevo. Mensualidad arranca el mes que empiece el proyecto completo.

**Si deciden NO continuar:** Centinelia conserva los $45,000 como compensación justa por el trabajo realizado. IPark se lleva: el aprendizaje documentado del POC (reporte final con hallazgos útiles para su operación interna), el prompt afinado por si quieren explorar la integración con otro proveedor en el futuro, y cero compromiso continuo.

### Cuándo recomendamos esta opción

- Si IPark necesita demostrar valor internamente antes de aprobar el dev completo con Dirección o Finanzas
- Si hay dudas razonables sobre si Nala realmente puede manejar el volumen y variedad de correos reales de IPark
- Si el equipo de dev de IPark no tiene bandwidth inmediato para construir el endpoint
- Si el budget de $200K del proyecto completo es demasiado para este trimestre y necesitan empezar más chico

Este POC se puede ejecutar incluso si IPark aún no ha decidido entre Opción A, B, o C de arquitectura, porque no toca el Conector real. Durante el POC pueden tomar esa decisión arquitectural con calma.

---

## Términos y condiciones

- **Facturación:** Centinelia emite factura mensual contra RFC de IPark con los datos fiscales que proporcionen.
- **Pago:** 15 días naturales a partir de recepción de la factura. Transferencia bancaria a cuenta Centinelia.
- **Vigencia del contrato:** mes a mes después del compromiso POC de 3 meses. Cualquiera de las partes puede cancelar con 30 días de aviso.
- **Garantía POC:** si al término del mes 3 IPark no observa mejora medible en tiempo de respuesta al cliente final o cobertura automática de al menos 60% del volumen, Centinelia reembolsa el 50% del desarrollo pagado hasta ese punto. Setup y mensualidades no se reembolsan.
- **Propiedad del código:** el adapter Conector C1 y los módulos de integración son propiedad intelectual de Centinelia. IPark tiene licencia de uso perpetua mientras mantenga contrato activo. Si cancela, el código permanece en operación hasta el día de corte del servicio.
- **Confidencialidad:** NDA mutuo cubriendo datos fiscales de clientes de IPark, credenciales, código fuente, métricas operativas.
- **SLA Centinelia:** 99.5% uptime del servicio Nala durante horario operativo. Caídas superiores a 2h durante horario laboral se compensan prorrateadas en el siguiente ciclo de facturación.

---

## Siguiente paso

1. Reunión técnica lunes 2026-10-05, 10:00 AM (ya agendada por Americo).
2. Alineación del contrato JSON del endpoint IPark en esa reunión.
3. Envío de propuesta formal firmada tras resolver las decisiones técnicas abiertas.
4. Kickoff del desarrollo dentro de los 10 días naturales siguientes a la firma.
5. Primer timbrado real en sandbox: estimado 4-6 semanas desde el kickoff, dependiendo de la disponibilidad del equipo de IPark para probar el endpoint.
6. Arranque productivo: estimado 6-8 semanas desde el kickoff.
