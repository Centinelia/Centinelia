# Propuesta de automatización del canal de facturación por correo

## IPark Estacionamientos

**Preparado para:** Francisco J. Chapa V., IPark Estacionamientos
**Preparado por:** Nazre Assad, Centinelia
**Fecha:** 4 de octubre de 2026
**Validez de la propuesta:** 30 días naturales

---

## 1. Resumen ejecutivo

IPark Estacionamientos recibe aproximadamente mil correos por mes de clientes que no pudieron facturar por el portal de autoservicio y escriben directamente al inbox de facturación solicitando su CFDI. Hoy este volumen lo resuelve un equipo humano, con los costos operativos y de tiempo de respuesta que implica atender manualmente cada caso.

Centinelia propone automatizar completamente este canal mediante **Nala**, una empleada digital que vive conectada al inbox de facturación, lee cada correo que entra, decide si corresponde a una solicitud de factura, extrae los datos fiscales del cliente, y timbra el CFDI usando el Conector C1 de InvoiceOne que IPark ya opera. La factura resultante se envía al cliente final por correo en segundos.

### Inversión y retorno estimado

Antes de ver los montos, el marco de referencia: la automatización representa una inversión inicial que se recupera entre los meses 9 y 12 de operación continua, comparada contra el costo actual del proceso manual, que oscila entre $20,000 y $30,000 MXN mensuales en salario cargado y tiempo supervisor. Más allá del ahorro directo, el proyecto entrega respuesta inmediata al cliente final, cobertura 24 horas los 7 días de la semana, y escalabilidad sin crecimiento proporcional del equipo humano conforme IPark expanda sucursales.

Con ese contexto, dos rutas de inversión según el nivel de compromiso que IPark prefiera arrancar:

| Opción | Compromiso inicial | Mensualidad continua | Tiempo al arranque productivo |
|---|---|---|---|
| **Proyecto completo** | $164,990 MXN + IVA (desarrollo + setup) | $11,988 MXN + IVA | 4 a 6 semanas |
| **POC mínimo de validación** | $45,000 MXN + IVA (todo incluido) | $0 durante el POC | 2 a 3 semanas |

Todos los montos de la propuesta son en pesos mexicanos antes de IVA (16%). Los $45,000 + IVA del POC se acreditan íntegramente contra el desarrollo si IPark decide continuar al proyecto completo. Esto permite validar el valor con datos reales antes de comprometer la inversión mayor. La sección 6 desglosa en detalle los componentes de cada opción, y la sección 7 profundiza en el análisis de retorno de inversión.

---

## 2. El reto operativo que resolvemos

El inbox de facturación de IPark recibe alrededor de 1,000 correos mensuales de clientes que, por distintas razones, no utilizaron el portal público de autoservicio. Entre ellas: desconocimiento del portal, boleto extraviado, datos fiscales incompletos al momento de salir, necesidad de corrección en una factura ya emitida, o preferencia por el canal de correo sobre el autoservicio.

Resolver este volumen manualmente implica varios costos:

- **Tiempo humano dedicado:** procesar 1,000 correos mensuales equivale a aproximadamente una persona de tiempo completo dedicada exclusivamente a facturación por correo.
- **Latencia en la respuesta al cliente:** el cliente recibe su factura horas o días después, no en el momento. Para viajeros de negocios que necesitan deducir el estacionamiento como gasto, esta demora genera fricción.
- **Rotación y variabilidad:** la calidad de la respuesta depende de quién atienda el correo ese día. Vacaciones, incapacidades y rotación de personal introducen gaps.
- **Oportunidad perdida:** las horas que el equipo humano invierte en procesos repetitivos no se dedican a casos que sí requieren criterio (corrección de facturas, escalaciones fiscales, atención a clientes corporativos complejos).

El objetivo de este proyecto es que ese volumen rutinario deje de ser trabajo humano, para que el equipo actual de facturación pueda enfocarse en auditar, mejorar el proceso, y atender los casos complejos que sí lo ameritan.

---

## 3. La solución: Nala, empleada digital de facturación

Nala es una de las empleadas digitales del catálogo Centinelia, especializada en el canal de correo electrónico. Opera como un miembro más del equipo de IPark, con un rol claro y un prompt entrenado específicamente para el contexto de estacionamientos de estancia larga en aeropuertos.

### Qué hace Nala en IPark

- Lee en tiempo real cada correo que entra al inbox de facturación.
- Decide si el correo es una solicitud de factura o pertenece a otra categoría (queja operativa, correo interno, marketing, notificación automática).
- Extrae los datos fiscales del cliente: RFC, razón social, régimen fiscal, uso del CFDI, código postal, folio del boleto de estancia.
- Si el correo original no trae todos los datos necesarios, responde al cliente pidiendo únicamente lo faltante (sin bombardearlo con un formulario largo) y espera la respuesta antes de continuar.
- Valida la información extraída contra las reglas vigentes del CFDI 4.0 del SAT.
- Dispara el timbrado del CFDI vía el Conector C1 de InvoiceOne que IPark ya opera.
- Envía el XML y el PDF resultantes al cliente final por correo, en el idioma en que escribió (español o inglés según corresponda).
- Escala a un humano del equipo IPark los casos que genuinamente requieren criterio: RFC inválido en el padrón del SAT, meses fiscales ya cerrados, boletos no encontrados, solicitudes de corrección de facturas ya emitidas.
- Registra cada acción en un panel operativo donde el equipo de IPark puede auditar en tiempo real.

### Qué NO hace Nala

Para que quede claro el alcance base del proyecto:

- No cancela facturas por su cuenta. Las cancelaciones las aprueba un humano.
- No modifica configuraciones fiscales de IPark ni toca el CSD.
- No decide políticas internas de IPark sobre quién puede facturar fuera de plazo.
- No comparte credenciales ni información sensible por ningún canal.
- No responde correos operativos que no son de facturación (quejas por daños, consultas de disponibilidad, cadenas internas).

**Nota de expansión de scope:** cualquiera de estas funciones puede incorporarse al proyecto si IPark lo requiere. Por ejemplo, Nala puede ampliarse para procesar cancelaciones bajo políticas específicas que IPark defina, atender quejas operativas con escalación estructurada, o encargarse de responder categorías adicionales de correo. Cada expansión se cotiza por separado según el alcance y queda documentada como adenda al contrato principal.

### Capacidad operativa

Nala puede procesar varios miles de correos por mes sin degradación de calidad. El volumen base acordado para arrancar es de 3,000 operaciones mensuales incluidas en el plan, con capacidad de escalar a tiers superiores conforme IPark expanda sucursales o incremente volumen.

---

## 4. Cómo se integra con InvoiceOne

Centinelia ya mantiene comunicación directa con InvoiceOne respecto a esta integración. El equipo Comercial y de Soporte de InvoiceOne (Emmanuel Coronado y Jaime Hinojosa, con apoyo del equipo técnico) autorizó el acceso al ambiente de pruebas del Conector C1 bajo el convenio existente de IPark, con 400 timbres de prueba sin costo, extensibles según necesidad.

El Conector C1 funciona por intercambio de archivos de texto en formato específico. IPark ya opera este Conector hoy. La integración con Centinelia requiere acordar cómo Nala le entrega las solicitudes de timbrado al Conector y cómo recupera los CFDIs timbrados. Para esto, Centinelia e IPark tienen tres rutas técnicas posibles:

### Opción A: IPark construye un endpoint HTTPS

El equipo técnico de IPark construye un endpoint HTTPS que recibe las solicitudes de Centinelia, arma internamente el archivo que el Conector espera, y devuelve el CFDI timbrado. Centinelia nunca toca el filesystem de IPark.

- Pro: contrato de integración limpio, mínima superficie expuesta.
- Contra: implica trabajo de desarrollo del lado de IPark.

### Opción B: Centinelia accede vía SFTP a la carpeta de salida

IPark otorga a Centinelia acceso de lectura a la carpeta donde el Conector deposita las facturas timbradas. Nala recoge los archivos como un humano digital siguiendo el mismo patrón que el equipo de IPark usa hoy.

- Pro: reusa el patrón operativo que IPark ya tiene en marcha, mínimo trabajo del lado de IPark.
- Contra: Centinelia tiene vista a todas las facturas de IPark en esa carpeta.

### Opción C: Sub-carpeta dedicada con prefijo Serie CEN

Variante de la B donde el Conector (o un script auxiliar) rutea las facturas emitidas por Nala a una sub-carpeta dedicada. Nala solo tiene acceso a esa sub-carpeta.

- Pro: aisla visibilidad de Nala solo a sus propias facturas.
- Contra: requiere confirmar con InvoiceOne si el Conector soporta este tipo de ruteo.

**La decisión arquitectural la toma el equipo técnico de IPark** según sus políticas internas de seguridad, bandwidth de desarrollo y preferencia operativa. Esta decisión es independiente de la decisión comercial y se discute en la reunión técnica agendada con Americo Medina y su equipo para el lunes 5 de octubre.

---

## 5. Alcance del proyecto

### Lo que Centinelia construye y entrega

- Adapter de integración con el Conector C1 de InvoiceOne, implementado según la opción arquitectural que IPark elija.
- Pipeline de procesamiento de correo con Nala, incluyendo extracción, decisión, generación de respuestas en español e inglés, y manejo de todos los casos edge documentados (público en general, extranjeros sin RFC mexicano, notas de crédito, múltiples boletos en un correo, correos de entrega distintos al remitente, clientes que escribieron antes del pago).
- Panel de monitoreo en el portal Centinelia donde el equipo IPark puede ver en tiempo real cada correo procesado, decisión tomada, factura emitida y escalación generada.
- Reportes semanales automatizados por correo al punto de contacto que IPark designe, con métricas operativas.
- Suite de pruebas end-to-end validadas contra el ambiente sandbox de InvoiceOne, con los 16 casos de prueba representativos del volumen real.
- Documentación operativa y runbook para el equipo IPark: cómo monitorear, cómo escalar incidencias, cómo consultar estado de timbrados, cómo manejar excepciones.
- Capacitación en 1 sesión de 60 minutos para el punto de contacto operativo de IPark.

### Lo que Centinelia requiere de IPark

Para arrancar el proyecto:

- Confirmación de la opción arquitectural elegida (A, B, o C), definida en la reunión técnica del 5 de octubre.
- Credenciales o accesos según la opción elegida.
- Alta de la Serie fiscal en EasyOne con rango de folios reservado para Centinelia (sugerencia: Serie `CEN`, rango inicial 1 al 10,000).
- Alias de correo de pruebas (ej. `pruebas-centinelia@ipark.com.mx`) con reenvío automático al inbox de Nala.
- Un punto de contacto técnico de IPark para resolución de dudas durante la integración.
- Un punto de contacto operativo de IPark para el día a día de la operación productiva.

### Timeline del proyecto completo

Centinelia llega al proyecto con avances significativos ya documentados y probados: prompt de Nala IPark refinado con casos especiales, hash de idempotencia validado con 12 pruebas, prototipo del constructor de archivo TXT validado contra los ejemplos oficiales del PDF de InvoiceOne, contrato JSON diseñado, 10 ejemplos de casos edge documentados, y organización de demo provisionada. Esto permite comprimir el timeline estándar:

| Fase | Semanas | Entregable |
|---|---|---|
| 1. Kickoff y provisionamiento | 1 | Contrato firmado, accesos provisionados por IPark, Serie CEN activa |
| 2. Desarrollo del adapter productivo | 2 | Promoción de prototipos a producción, cliente de integración, idempotencia |
| 3. Pruebas end-to-end en sandbox | 2 a 3 | Primer CFDI real timbrado en pruebas, validación de casos edge |
| 4. Afinación y rollout controlado | 3 a 4 | Panel operativo listo, reportes configurados, Nala al 10% del volumen |
| 5. Rollout completo | 4 a 6 | Nala al 100% del volumen entrante, operación estabilizada |

---

## 6. Inversión detallada

### Opción recomendada: Proyecto completo

Todos los montos en pesos mexicanos antes de IVA (16%).

| Componente | Monto MXN + IVA | Esquema de pago |
|---|---|---|
| Desarrollo del adapter Conector C1 | $150,000 | 50% al kickoff, 50% al primer timbrado en producción |
| Setup, provisionamiento y onboarding | $14,990 | Al kickoff |
| Mensualidad Nala (plan Jornada Tareas Alta Demanda) | $11,988 por mes | Mensual |
| **Compromiso total 3 meses de operación** | **$200,954 + IVA** | |

El compromiso de 3 meses de operación es el período inicial mínimo del servicio; después del mes 3, el contrato continúa mes a mes con capacidad de cancelación por cualquiera de las partes con 30 días naturales de aviso. No se refiere al tiempo de desarrollo (que es de 4 a 6 semanas desde kickoff).

La mensualidad incluye 3,000 operaciones (ops) por mes, cubriendo el volumen estimado base de 1,000 correos mensuales con margen para crecimiento. Si en algún momento el consumo real excede 3,000 ops/mes, aplica el mecanismo de compra puntual de tareas adicionales a $8.50 MXN + IVA cada una, o se migra al tier Empresarial con cotización personalizada.

### Alternativa B: Estructura escalonada sin pago inicial fuerte

Pensada para IPark si prefiere no desembolsar los $150,000 + IVA de desarrollo al inicio:

| Componente | Monto MXN + IVA |
|---|---|
| Setup al kickoff | $14,990 |
| Mensualidad meses 1 al 6 (incluye prorrateo del desarrollo) | $36,988 por mes |
| Mensualidad mes 7 en adelante | $11,988 por mes |

Esta estructura reduce la barrera de entrada inicial de $164,990 + IVA a $14,990 + IVA. El costo total neto es ligeramente mayor (aproximadamente $5,000 + IVA adicionales a lo largo de los 6 meses) por el beneficio de diferimiento.

### Opción 0: POC mínimo de validación

Pensada para IPark si prefiere validar que Nala funciona con sus correos reales **antes** de comprometer el desarrollo completo. Diseñada para reducir drásticamente el riesgo inicial.

**Alcance del POC:**

- IPark configura un alias de correo de pruebas con reenvío automático al inbox de Nala.
- Durante 2 a 3 semanas, Nala procesa entre 50 y 100 correos reales de facturación: lee, decide, extrae datos, genera respuestas.
- Nala **no timbra realmente** durante el POC. En lugar de generar CFDIs reales, marca cada caso como "listo para timbrar" y documenta qué datos habría enviado al Conector. IPark no tiene que construir nada, no se tocan sus sistemas fiscales, no se emiten CFDIs reales a clientes.
- Centinelia produce reporte semanal con datos reales: precisión de extracción, porcentaje de escalación, calidad de respuestas, casos edge detectados.
- Al cierre del POC, reunión de resultados con decisión informada sobre si continuar al proyecto completo.

**Inversión:** $45,000 MXN + IVA totales, pagaderos al kickoff del POC. Incluye setup, afinación del prompt con correos reales, panel de observabilidad, reportes semanales, soporte técnico durante las 2 a 3 semanas y reunión final de resultados.

**Mecánica de crédito:** si IPark decide continuar al proyecto completo después del POC, los $45,000 + IVA se acreditan íntegramente contra el desarrollo del adapter real ($150,000 + IVA netos pasan a $105,000 + IVA). El setup del POC se reutiliza sin cobrarse de nuevo.

Si IPark decide no continuar, Centinelia conserva los $45,000 + IVA como compensación por el trabajo realizado. IPark se lleva el reporte final con hallazgos operativos útiles y el prompt afinado, con cero compromiso continuo.

---

## 7. Retorno de inversión

Comparación conservadora entre el proceso manual actual y la operación con Centinelia:

| Dimensión | Proceso manual actual | Con Centinelia |
|---|---|---|
| Costo mensual estimado | $20,000 a $30,000 MXN | $11,988 MXN + IVA |
| Tiempo de respuesta al cliente | Horas o días | Segundos |
| Horario de atención | Laboral | 24 horas, 7 días |
| Variabilidad por rotación | Alta | Nula |
| Escalabilidad al duplicar volumen | Lineal con headcount | Sin incremento proporcional |
| Métricas de calidad auditables | Difíciles de medir | En tiempo real |

El punto de equilibrio del proyecto completo (recuperación de los $164,990 + IVA iniciales vs. ahorro mensual) se estima entre 9 y 12 meses de operación continua, asumiendo que IPark reasigna o reduce el equipo humano actual al liberarse del volumen rutinario.

Si durante ese periodo IPark expande sucursales y el volumen de correos crece, el punto de equilibrio se acorta porque el costo marginal de atender cada correo adicional es muy bajo.

---

## 8. Términos comerciales

- **Facturación:** Centinelia emite factura mensual bajo el RFC que IPark proporcione.
- **Condiciones de pago:** 15 días naturales a partir de la recepción de la factura, mediante transferencia electrónica.
- **Vigencia del contrato:** mes a mes después del compromiso inicial de 3 meses de operación. Cualquiera de las partes puede cancelar con 30 días naturales de aviso previo.
- **Garantía de los primeros 3 meses de operación:** si al término del mes 3 IPark no observa mejora medible en el tiempo de respuesta al cliente o en la cobertura automática de al menos 60% del volumen entrante, Centinelia reembolsa el 50% del monto de desarrollo pagado hasta ese punto. Setup y mensualidades no se reembolsan.
- **Confidencialidad:** NDA mutuo cubriendo datos fiscales de clientes de IPark, credenciales de acceso, código fuente y métricas operativas.
- **Propiedad del código:** el adapter Conector C1 y los módulos de integración son propiedad intelectual de Centinelia. IPark tiene licencia de uso perpetua mientras mantenga contrato activo. Si cancela, el servicio opera hasta el día de corte sin dejar código en poder de IPark.
- **SLA Centinelia:** 99.5% de disponibilidad del servicio Nala durante horario operativo. Caídas superiores a 2 horas durante horario laboral se compensan prorrateadas en el siguiente ciclo de facturación.
- **Timbres fiscales:** el costo de los timbres en EasyOne corre por cuenta de IPark con InvoiceOne directamente. Centinelia no es intermediario ni revende timbres.

---

## 9. Próximos pasos

1. **Reunión técnica lunes 5 de octubre, 10:00 AM MX** con Americo Medina y su equipo de desarrollo. Agenda: definir opción arquitectural (A, B o C), Serie fiscal, timeline técnico. Agendada previamente, confirmada por Americo.
2. **Evaluación interna de esta propuesta por Francisco Chapa** y quien corresponda en la Dirección o Finanzas de IPark. Validez de la propuesta: 30 días naturales desde la fecha de este documento.
3. **Firma de propuesta y NDA mutuo** si IPark decide proceder.
4. **Kickoff del proyecto** dentro de los 10 días naturales siguientes a la firma.
5. **Primer timbrado real en sandbox:** 2 a 3 semanas desde kickoff.
6. **Arranque productivo:** 4 a 6 semanas desde kickoff.

---

## 10. Contacto

**Nazre Assad**
Fundador, Centinelia
+52 811 280 3360
hola@centinelia.mx
centinelia.mx

Monterrey, Nuevo León, México

---

## Aceptación de propuesta

Si IPark Estacionamientos decide proceder con la opción elegida de esta propuesta, basta responder a este documento por correo con la elección de opción (Proyecto completo, Alternativa B escalonada, u Opción 0 POC mínimo) y los nombres del equipo IPark que firmarán el NDA. Centinelia enviará los documentos formales para firma en las 48 horas siguientes.
