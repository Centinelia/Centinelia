# Respuesta al Informe de Observaciones — Nia, Municipio de Santiago Nuevo León

**Referencia:** Informe de Observaciones y Oportunidades de Mejora en la Atención Telefónica (evaluación de demo).
**Fecha de respuesta:** 26 de septiembre de 2026
**Equipo:** Centinelia

---

## Contexto

Agradecemos las observaciones detalladas del equipo del municipio tras las pruebas de evaluación. El presente documento responde punto por punto a cada incidencia registrada, distinguiendo entre:

- **Ajustes técnicos y de configuración** que Centinelia ha aplicado directamente al servicio de Nia.
- **Ajustes de comportamiento** implementados a través de reglas de operación que Nia ahora respeta en cada llamada.
- **Puntos que dependen de la información oficial completa del municipio**, que en el demo actual se atienden con la información pública disponible en `santiago.gob.mx/servicios` y sus fichas descargables.

**Nota importante sobre el alcance del demo:** las pruebas se realizaron con la información pública que ofrece el portal del municipio de Santiago NL (fichas oficiales de trámites descargables). Un demo permite validar que la tecnología funciona con la información que tiene disponible. Para producción, la calidad de las respuestas de Nia depende directamente de la información oficial y completa que se le comparta. Un empleado nuevo, humano o digital, no puede responder con certeza sobre trámites, servidores públicos o procesos internos si no cuenta con esa información documentada.

---

## 1. Estabilidad Técnica y Comportamiento del Sistema

### 1.1 Interrupción por ruido ambiental

**Observación:** Ante cualquier interferencia o ruido externo por parte del usuario, el agente interrumpe su discurso y reinicia el mensaje desde el comienzo.

**Respuesta:** Ajuste de configuración aplicado.

Se afinaron los parámetros de detección de voz de Nia para exigir al menos tres palabras del ciudadano antes de considerarlo una interrupción real, y se agregó una espera adicional de 600 milisegundos antes de dar por concluido el turno del ciudadano. Con estos ajustes, ruidos ambientales cortos (portazos, sirenas, murmullos) ya no cortan el discurso de Nia. Solo una intervención real del ciudadano la interrumpe.

### 1.2 Fallas en la transmisión de audio (voz entrecortada, silencios)

**Observación:** Tras cierto tiempo de interacción, la voz se entrecorta, emite palabras incompletas y el sistema se queda en silencio.

**Respuesta:** Ajuste de configuración aplicado, con seguimiento activo.

Se aumentó el parámetro de estabilidad de la voz sintetizada de 0.35 a 0.50 para reducir el entrecortado en llamadas largas. También se aumentó el tiempo máximo de silencio permitido antes de dar la llamada por terminada, de 10 segundos a 25 segundos, para evitar cierres prematuros durante pausas naturales.

Si el entrecortado persiste después de estos ajustes, se investigará como problema de latencia con el proveedor de voz o de red del cliente, monitoreando latencias en llamadas mayores a cinco minutos.

### 1.3 Corte de llamada al solicitar transferencia

**Observación:** Se registró la finalización abrupta de la llamada por parte del agente digital al momento de solicitar una transferencia de línea.

**Respuesta:** Ajuste técnico aplicado.

Se identificó que el número al que Nia intenta transferir se guardaba sin el prefijo internacional (+52). Ahora todos los números se normalizan automáticamente al formato E.164 (`+528112803360`) antes de solicitar la transferencia. Esto previene el rechazo por parte del proveedor telefónico que causaba el corte de llamada.

### 1.4 Falta de persistencia de datos entre llamadas

**Observación:** Si la llamada se interrumpe y el usuario vuelve a comunicarse, el sistema no conserva el historial ni la información previa del ciudadano.

**Respuesta:** Funcionalidad disponible, activable por solicitud.

Nia tiene la capacidad técnica de recordar llamadas previas del mismo número telefónico. Esta funcionalidad (llamada "memoria del cliente") no viene activa por defecto porque implica que Nia consulta la base de datos del municipio en cada llamada. Se puede activar para Santiago NL si se confirma que es un comportamiento deseado. Con esta activación, Nia podría decir por ejemplo: "veo que la semana pasada llamó por el mismo tema, ¿quiere continuar con lo que quedó pendiente?"

**Requiere confirmación del municipio.** La activación se realiza en minutos una vez confirmada.

---

## 2. Comprensión del Lenguaje y Contexto

### 2.1 Errores de interpretación (asignación de nombres incorrectos)

**Observación:** Presenta fallas en la comprensión del contexto. Por ejemplo, asigna nombres incorrectos al usuario sin que este los haya proporcionado.

**Respuesta:** Regla de operación insertada.

Nia ahora tiene una regla explícita: **"Nunca inventes ni asumas el nombre del usuario que llama. Solo usa el nombre del usuario si él mismo lo dictó explícitamente en la llamada actual. Si no lo dijo, refiérete a él de forma neutral (ciudadano, señor, señora)."**

Esta regla se aplica en cada llamada y en cada turno de la conversación. Si Nia no recibió el nombre del ciudadano, no lo inventa ni lo saca de conversaciones anteriores.

### 2.2 Detección limitada de nombres de servidores públicos

**Observación:** Si el usuario consulta por un servidor público utilizando únicamente su primer nombre, el agente no lo reconoce; requiere el nombre completo.

**Respuesta:** Requiere información oficial del municipio.

Para que Nia reconozca a un servidor público por cualquier variante que use el ciudadano (primer nombre, apellido, tratamiento informal como "el señor Pérez"), se necesita cargar un directorio oficial con los nombres completos, puestos, áreas, extensiones y las variantes de referencia comunes.

**Este directorio no está disponible en el portal público del municipio.** Se solicita al equipo del municipio compartir la lista oficial actualizada para incorporarla como ficha informativa. Con esa información cargada, Nia podrá resolver referencias como "el ingeniero de obras" o "María de tesorería" a la persona correcta.

**Formato recomendado del directorio:** una lista con nombre completo, puesto, área, extensión, correo institucional y horario de atención. Un archivo por servidor o un directorio consolidado.

### 2.3 Aceptación de solicitudes fuera del alcance municipal

**Observación:** Ante consultas ajenas a la función municipal, el agente no delimita su alcance y confirma transferencias para trámites inexistentes o no institucionales.

**Respuesta:** Regla de operación insertada, con oportunidad de fortalecimiento.

Nia tiene ahora la regla explícita: **"Antes de confirmar cualquier transferencia, verifica que el trámite existe. Consulta primero las fichas informativas. Si el trámite solicitado no aparece o no lo maneja el municipio de Santiago, dilo explícito: 'Ese servicio no lo maneja el municipio, no puedo transferirlo.' No confirmes ni ofrezcas transferencias para trámites que no existen."**

**Para fortalecer esta respuesta** conviene cargar una ficha con la lista de servicios que **no** son competencia municipal y a qué organismo se refieren (CURP a Renapo, licencia de conducir a Tránsito estatal, agua estatal a Servicios de Agua y Drenaje de Monterrey, etc.). Esta lista tampoco está publicada en el portal del municipio. Con esa ficha adicional, Nia no solo se abstendrá de confirmar, sino que podrá orientar correctamente al organismo responsable.

---

## 3. Precisión de la Información y Gestión de Trámites

### 3.1 Información inexacta sobre multas y quejas de tránsito

**Observación:** Orienta de forma errónea al ciudadano hacia la Tesorería para consultar detalles o aclaraciones sobre multas de tránsito, omitiendo que dicha área únicamente procesa el cobro del trámite.

**Respuesta:** Ficha oficial cargada. Nia ahora consulta la información correcta.

Se cargó al conocimiento de Nia la ficha oficial `TS-SFT-ING-01 Pago y Aplicación de Descuento en Multas de Tránsito` descargada del portal del municipio. Esta ficha describe el proceso oficial de multas.

**Consideración importante:** el portal público del municipio no distingue explícitamente entre "consultas y aclaraciones de multas" (que corresponden al área de Tránsito Municipal) y "pago de la multa una vez conocido el monto" (que corresponde a Tesorería). La ficha oficial documenta el pago, no la aclaración.

**Para prevenir completamente esta mala orientación** se necesita información oficial adicional que aclare a qué área específica dirigir cada tipo de consulta ciudadana. Esta información no está en la ficha pública actual.

Mientras tanto, con la regla insertada sobre transferencias verificadas y con la ficha oficial cargada, Nia ya no orientará a Tesorería para "aclarar" nada, solo para pagos confirmados. Si el ciudadano tiene dudas sobre la multa, Nia le dirá que necesita más información para dirigirlo correctamente en lugar de mandarlo al lugar equivocado.

### 3.2 Transferencias incompletas (extensión sin departamento ni persona)

**Observación:** Proporciona números de extensión telefónica sin especificar el departamento, área o persona con la que se canalizará al usuario.

**Respuesta:** Regla de operación insertada.

Nia tiene ahora la regla: **"Al transferir, siempre menciona primero el departamento y la persona antes que la extensión. Formato correcto: 'Te voy a transferir con [Departamento], con [Nombre de la persona si lo tienes], extensión [número].' Nunca digas solo el número de extensión sin el contexto del departamento."**

**Cobertura parcial en el demo actual:** Nia dirá el departamento correctamente porque las fichas oficiales cargadas contienen el nombre del área. Para decir también el nombre de la persona que atenderá, requiere el directorio del municipio (punto 2.2 arriba). Sin ese directorio, Nia mencionará "con la Secretaría de Finanzas y Tesorería Municipal, extensión [número]" — correcto y suficiente para orientar al ciudadano, pero sin el nombre específico de quien contestará.

---

## 4. Adherencia a Reglas de Convivencia y Flujo de Diálogo

### 4.1 Incumplimiento de restricciones de lenguaje

**Observación:** A pesar de que el usuario indica explícitamente no utilizar ciertas palabras o términos no deseados, el agente vuelve a emplearlos de forma recurrente durante la interacción.

**Respuesta:** Regla de operación insertada.

Nia tiene ahora la regla: **"Respeta las palabras o términos que el usuario pida no usar durante la llamada. Si el usuario dice 'no me digas X' o 'no uses la palabra Y', no la vuelvas a usar en el resto de la conversación. Esta restricción vive solo durante la llamada actual y se olvida al final."**

Con esta regla activa, Nia sostiene la restricción durante toda la llamada. Al finalizar la llamada, la restricción se olvida para no afectar interacciones futuras con otros ciudadanos que no tengan esa preferencia.

---

## Resumen ejecutivo

| # | Observación | Estado | Depende de |
|---|---|---|---|
| 1.1 | Interrupción por ruido ambiental | Resuelto | Ajuste técnico aplicado |
| 1.2 | Voz entrecortada y silencios | Ajustado con seguimiento | Ajuste técnico + monitoreo |
| 1.3 | Corte al pedir transferencia | Resuelto | Ajuste técnico aplicado |
| 1.4 | Persistencia entre llamadas | Disponible | Confirmación del municipio para activar |
| 2.1 | Nombres incorrectos al usuario | Resuelto | Regla de operación insertada |
| 2.2 | Servidor público por primer nombre | Cobertura parcial | Directorio oficial del municipio |
| 2.3 | Solicitudes fuera de alcance | Cobertura parcial | Lista oficial de servicios no municipales |
| 3.1 | Multas mal orientadas a Tesorería | Cobertura parcial | Aclaración oficial de áreas municipales |
| 3.2 | Transferencias sin departamento | Cobertura parcial | Directorio oficial del municipio |
| 4.1 | Palabras que el usuario pidió no usar | Resuelto | Regla de operación insertada |

---

## Solicitud al equipo del municipio

Para llevar a Nia a su capacidad máxima en Santiago NL y cerrar completamente todas las observaciones, se solicita al municipio compartir los siguientes documentos oficiales:

1. **Directorio de servidores públicos**: nombre completo, puesto, área, extensión, correo institucional y horario de atención. Puede ser un archivo consolidado o uno por servidor.

2. **Lista de servicios que no son competencia municipal**: para que Nia oriente al organismo correcto (federal, estatal, privado) en lugar de intentar transferir internamente.

3. **Guía de derivación por tipo de consulta**: por ejemplo, "consultas de multas van a Tránsito Municipal, pago de multas va a Tesorería". Cualquier proceso interno del municipio que aclare a qué área dirigir cada tipo de duda ciudadana.

4. **Cualquier ficha informativa adicional** de trámites o servicios frecuentes que no estén publicados en el portal `santiago.gob.mx/servicios`.

Cada documento entregado se procesa e incorpora al conocimiento de Nia en pocos minutos. Los que estén en formato PDF se pueden subir directamente sin conversión.

---

## Consideración final

Los ajustes técnicos (Sección 1) y las reglas de operación (2.1, 2.3, 3.2, 4.1) resuelven completamente los problemas relacionados con **cómo se comporta Nia**. Lo que resta para producción es **con qué información responde Nia**. El demo actual funciona con la información pública que ofrece el portal del municipio. Para dar el servicio completo con la certeza de un empleado experimentado, Nia necesita la información oficial y completa que solo el municipio posee.

Un demo es una prueba de que la tecnología funciona con la información que tiene disponible. Con la información oficial completa, Nia responderá con la misma precisión que un empleado con toda la documentación del municipio a la mano.

Quedamos a la orden para agendar la carga de la información adicional una vez que el equipo del municipio la tenga lista.

---

*Documento generado el 26 de septiembre de 2026 por el equipo Centinelia como respuesta al Informe de Observaciones y Oportunidades de Mejora en la Atención Telefónica.*
