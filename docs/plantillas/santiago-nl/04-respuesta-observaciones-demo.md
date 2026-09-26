# Respuesta al Informe de Observaciones · Nia, Municipio de Santiago Nuevo León

**Referencia:** Informe de Observaciones y Oportunidades de Mejora en la Atención Telefónica (evaluación de demo).
**Fecha de respuesta:** 26 de septiembre de 2026
**Equipo:** Centinelia

---

## Contexto

Agradecemos las observaciones detalladas del equipo del municipio tras las pruebas. Este documento responde punto por punto a cada una. Antes de entrar a los puntos, dos aclaraciones importantes que aplican a la mayoría de las observaciones:

**Nia responde con la información que tenga cargada, no puede inventar lo que no le compartimos.** Igual que un servidor público que acaba de entrar al municipio, si Nia no tiene el directorio del personal, no puede saber que "el ingeniero de obras" se refiere a Cynthia Meléndez. Si no tiene la guía interna, no puede saber que las aclaraciones de multas se atienden en Tránsito y no en Tesorería. Esa información no está publicada en el portal `santiago.gob.mx/servicios`, así que Centinelia tampoco la tiene. Sin esos documentos, Nia responde honestamente "no tengo esa información" en lugar de inventar. Al final de este documento hay una lista con los archivos que el municipio necesita compartirnos para cerrar la mayoría de las observaciones.

**En un demo, algunas cosas se comportan como si fallaran aunque estén bien.** El demo prueba que la tecnología funciona; no está conectado a los sistemas reales del municipio (la central telefónica, el sistema de expedientes ciudadanos, la agenda de personal). Cuando Nia intenta transferir una llamada, el sistema no tiene a dónde entregarla y la llamada se corta. Eso es exactamente lo que debe pasar en el demo. En producción, ya conectada a esos sistemas, la transferencia se completa con normalidad. En cada punto abajo aclaramos qué parte se resuelve en el demo y qué queda para la puesta en marcha real.

---

## 1. Estabilidad Técnica y Comportamiento del Sistema

### 1.1 Interrupción por ruido ambiental

**Observación:** Ante cualquier interferencia o ruido externo por parte del usuario, el agente interrumpe su discurso y reinicia el mensaje desde el comienzo.

**Respuesta:** Ajustado.

Le subimos el umbral a Nia para que necesite escuchar al menos tres palabras del ciudadano antes de dejar de hablar. También agregamos una pausa breve extra antes de darle el turno de vuelta al ciudadano. Con eso, ruidos cortos (un portazo, una sirena, murmullos de fondo) ya no la interrumpen. Solo cuando la persona realmente empieza a hablar, Nia le cede el turno.

### 1.2 Fallas en la transmisión de audio (voz entrecortada, silencios)

**Observación:** Tras cierto tiempo de interacción, la voz se entrecorta, emite palabras incompletas y el sistema se queda en silencio.

**Respuesta:** Ajustado, con seguimiento.

Estabilizamos la voz de Nia para reducir el entrecortado en llamadas largas. También le dimos más margen de silencio antes de dar la llamada por terminada (pasó de 10 a 25 segundos), para que no cuelgue durante pausas naturales del ciudadano.

Si el entrecortado sigue apareciendo, vamos a revisarlo como un problema de la línea o de la red, monitoreando las llamadas de más de cinco minutos.

### 1.3 Corte de llamada al solicitar transferencia

**Observación:** Se registró la finalización abrupta de la llamada por parte del agente digital al momento de solicitar una transferencia de línea.

**Respuesta:** Esperado en demo. Se resuelve al conectarnos con la central telefónica del municipio.

En el demo, Nia no está conectada con la central telefónica del municipio, así que cuando dice "te voy a transferir con..." no hay a dónde entregar la llamada y por eso se corta. Ese corte es señal de que Nia tomó bien la decisión de transferir; simplemente no había línea de destino. En producción, ya conectada con la central del municipio, la llamada pasa al servidor público correspondiente sin cortarse.

De paso también corregimos algo útil para producción: los números a los que Nia transfiere ahora siempre incluyen el prefijo de país (+52). Sin ese prefijo, algunas telefónicas rechazan la transferencia.

La conexión con la central del municipio se acuerda y prueba durante la puesta en marcha del servicio.

### 1.4 Falta de persistencia de datos entre llamadas

**Observación:** Si la llamada se interrumpe y el usuario vuelve a comunicarse, el sistema no conserva el historial ni la información previa del ciudadano.

**Respuesta:** Activado el 26 de septiembre de 2026.

Nia ya reconoce las llamadas previas de un mismo número telefónico. En cada llamada nueva revisa las anteriores y personaliza la conversación con lo que sabe del ciudadano: qué motivo tuvo la llamada anterior, qué se le comentó, cómo quedó el tema. Así, al segundo contacto la persona se siente reconocida sin tener que repetir todo desde cero.

Para que este reconocimiento funcione, Nia necesita al menos una llamada previa de ese mismo número con conversación registrada. La primera vez que llama alguien nuevo, Nia lo saluda como nuevo, que es lo correcto. A partir de la segunda llamada del mismo número, ya lo reconoce.

Si en el futuro el municipio decide conectar a Nia con su sistema de expedientes ciudadanos, ese reconocimiento se enriquece con la información oficial del expediente. Ese paso se acuerda durante la puesta en marcha.

### 2.1 Errores de interpretación (asignación de nombres incorrectos)

**Observación:** Presenta fallas en la comprensión del contexto. Por ejemplo, asigna nombres incorrectos al usuario sin que este los haya proporcionado.

**Respuesta:** Resuelto.

Le dimos a Nia una instrucción clara: nunca inventar ni asumir el nombre del ciudadano. Solo lo usa si él mismo lo dijo en la llamada. Si no lo dijo, se dirige a él de forma neutral (ciudadano, señor, señora). Nunca lo saca de una conversación anterior ni lo adivina.

### 2.2 Detección limitada de nombres de servidores públicos

**Observación:** Si el usuario consulta por un servidor público utilizando únicamente su primer nombre, el agente no lo reconoce; requiere el nombre completo.

**Respuesta:** Limitación esperada del demo. Se resuelve con el directorio del municipio.

Nia hoy solo conoce a los servidores públicos que aparecen mencionados en las fichas del portal, donde por lo general solo viene el nombre completo del titular de un trámite. No tiene un directorio interno con las formas informales por las que los ciudadanos se refieren a cada persona: "el señor Pérez", "el ingeniero de obras", "María de tesorería", solo el primer nombre. Sin ese directorio, Nia no puede relacionar esas formas con la persona correcta, aunque el nombre completo aparezca en alguna ficha.

Un servidor público humano nuevo también necesita ese directorio para atender llamadas con soltura. La diferencia es que Nia lo aprende en segundos una vez que lo tiene.

Con el directorio del municipio cargado (ver la lista de documentos al final), esta observación queda cerrada.

### 2.3 Aceptación de solicitudes fuera del alcance municipal

**Observación:** Ante consultas ajenas a la función municipal, el agente no delimita su alcance y confirma transferencias para trámites inexistentes o no institucionales.

**Respuesta:** Parcialmente resuelto. Se cierra con la lista de servicios que no son del municipio.

Le dimos a Nia una instrucción clara: antes de confirmar cualquier transferencia debe revisar sus fichas informativas y verificar que el trámite realmente existe en el municipio. Si no aparece, ahora dice: "Ese servicio no lo maneja el municipio, no puedo transferirlo".

Para cerrar del todo esta observación, necesitamos que el municipio nos comparta la lista de servicios que **no** son de su competencia y a qué organismo se refieren (CURP → Renapo, licencia de conducir → Tránsito del estado, agua → SADM, etc.). Esa lista no está publicada en el portal municipal. Con ella cargada, Nia no solo evita confirmar, además orienta al ciudadano al organismo correcto y le ahorra una llamada perdida.

---

## 3. Precisión de la Información y Gestión de Trámites

### 3.1 Información inexacta sobre multas y quejas de tránsito

**Observación:** Orienta de forma errónea al ciudadano hacia la Tesorería para consultar detalles o aclaraciones sobre multas de tránsito, omitiendo que dicha área únicamente procesa el cobro del trámite.

**Respuesta:** Limitación esperada del demo. Se resuelve con una guía interna del municipio.

Nia atiende hoy con la única ficha oficial que el portal publica sobre multas de tránsito, la de "Pago y Aplicación de Descuento en Multas de Tránsito". Esa ficha describe cómo **pagar** la multa, no cómo **aclararla**. En ninguna parte del portal se dice que las aclaraciones se atienden en Tránsito Municipal y solo el pago en Tesorería.

Nia no puede saber esa separación si el municipio no la documenta. Con la sola información publicada en el portal, hasta un servidor público nuevo cometería exactamente el mismo error de orientación.

La solución es que el municipio nos comparta una guía sencilla de a qué área va cada tipo de consulta (ver documento 3 en la sección final). Con esa guía, Nia sabrá distinguir "quiero aclarar una multa" (área de Tránsito) de "ya sé cuánto debo y quiero pagar" (Tesorería), y orientará bien en cada caso.

Mientras esa guía llega, Nia ya recibió la instrucción de no confirmar transferencias cuando no tiene información suficiente; en esos casos prefiere pedir más detalle al ciudadano antes que mandarlo a un área equivocada.

### 3.2 Transferencias incompletas (extensión sin departamento ni persona)

**Observación:** Proporciona números de extensión telefónica sin especificar el departamento, área o persona con la que se canalizará al usuario.

**Respuesta:** Resuelto parcialmente. Se completa con el directorio.

Nia ahora siempre menciona primero el departamento y la persona antes de dar la extensión: "Le voy a transferir con la Dirección de Comercio, con [nombre], extensión tal". Nunca da solo el número de extensión sin contexto.

En el demo, Nia dice bien el departamento porque las fichas oficiales sí traen el nombre del área. Para decir también quién va a contestar, necesita el directorio del municipio (mismo directorio que pide el punto 2.2). Sin ese directorio, Nia dice "con la Secretaría de Finanzas y Tesorería, extensión tal", que es suficiente para orientar al ciudadano pero sin el nombre de la persona.

Sobre la transferencia física en sí: como se explica en el punto 1.3, en el demo no se completa porque Nia no está conectada con la central telefónica del municipio. Lo que sí se valida en las pruebas es que Nia decide correctamente a dónde transferir y anuncia bien el departamento, la persona (si tiene directorio) y la extensión. Al conectarnos con la central en producción, la llamada pasa realmente al servidor público correspondiente.

---

## 4. Adherencia a Reglas de Convivencia y Flujo de Diálogo

### 4.1 Incumplimiento de restricciones de lenguaje

**Observación:** A pesar de que el usuario indica explícitamente no utilizar ciertas palabras o términos no deseados, el agente vuelve a emplearlos de forma recurrente durante la interacción.

**Respuesta:** Se configura desde nuestro panel, no pidiéndolo por teléfono en cada llamada.

Las palabras que Nia nunca debe usar (siglas internas, coloquialismos que no queremos, referencias a otras dependencias, etc.) se configuran una sola vez desde nuestro panel de administración. A partir de ahí, Nia las respeta en **todas** las llamadas de forma permanente, sin que el ciudadano tenga que pedírselo cada vez.

Pedirlo por teléfono en el momento es la forma menos confiable: depende de que Nia lo recuerde en esa llamada específica y de que el ciudadano encuentre la palabra correcta a la primera. No es el mecanismo pensado para eso.

**Para producción:** compártenos la lista de palabras o términos que Nia deba evitar y los dejamos configurados de una vez. No los usará más en ninguna llamada.

---

## Resumen ejecutivo

| # | Observación | Estado | Qué falta |
|---|---|---|---|
| 1.1 | Interrupción por ruido ambiental | Resuelto | Nada |
| 1.2 | Voz entrecortada y silencios | Ajustado, con seguimiento | Nada por ahora |
| 1.3 | Corte al pedir transferencia | Esperado en demo · se resuelve en producción | Conexión con la central del municipio |
| 1.4 | Reconocer llamadas previas del mismo número | Activado el 26 de septiembre | Nada |
| 2.1 | Nombres incorrectos al usuario | Resuelto | Nada |
| 2.2 | Servidor público por primer nombre | Parcial | Directorio del personal |
| 2.3 | Solicitudes fuera del alcance | Parcial | Lista de servicios que no son del municipio |
| 3.1 | Multas mal orientadas a Tesorería | Parcial | Guía de a qué área va cada consulta |
| 3.2 | Transferencias sin departamento | Parcial en demo · completo en producción | Directorio + central telefónica |
| 4.1 | Palabras a evitar | Se configura desde nuestro panel | Lista de palabras a evitar |

---

## Documentos que necesitamos que el Municipio nos comparta

Estas piezas de información son la razón principal por la que Nia responde hoy con menos precisión de la que podría. No están publicadas en el portal público y no las podemos inventar. Con ellas cargadas, las observaciones 2.2, 2.3, 3.1 y 3.2 quedan cerradas.

### 1. Directorio del personal del municipio

**Qué necesitamos:** una lista de las personas del municipio con estos datos por persona:

- Nombre completo, y si aplica, apodos o formas informales por las que los ciudadanos suelen preguntar por esa persona.
- Puesto.
- Área o dirección a la que pertenece.
- Extensión.
- Correo institucional.
- Horario de atención al público.

**Por qué lo necesitamos:** sin este directorio, Nia no puede relacionar "el ingeniero de obras" o "María de tesorería" con la persona correcta. Con él, transfiere con nombre y extensión exactos, y le puede decir al ciudadano en qué horario atienden.

**Formato:** un solo archivo (Excel, PDF o Word) es ideal. Un archivo por persona también sirve.

### 2. Lista de trámites que NO son del municipio

**Qué necesitamos:** los trámites o consultas que los ciudadanos suelen pedirle al municipio pero que en realidad se resuelven en otras dependencias, indicando a dónde derivarlos. Ejemplos comunes:

- CURP → Renapo (federal).
- Licencia de conducir → Tránsito del estado.
- Agua potable → SADM (Servicios de Agua y Drenaje de Monterrey).
- Pasaporte → Secretaría de Relaciones Exteriores.
- Cualquier otro que el municipio detecte que le llegan con frecuencia.

**Por qué lo necesitamos:** sin esta lista, Nia intenta orientar dentro del municipio cosas que no le corresponden, o se disculpa sin poder redirigir. Con la lista, le dice al ciudadano exactamente a qué organismo llamar y le ahorra una llamada perdida.

**Formato:** una tabla sencilla con dos columnas: "trámite o consulta" y "a dónde derivar (con datos de contacto si los tienen)".

### 3. Guía de a qué área va cada tipo de consulta

**Qué necesitamos:** para los trámites del municipio que involucran a varias áreas, la aclaración de qué área atiende cada tipo de consulta. El ejemplo concreto que salió en las pruebas:

- Aclaración o consulta sobre una multa de tránsito → **Tránsito Municipal**.
- Pago de una multa de tránsito, ya sabiendo el monto → **Tesorería**.

Otros trámites donde suele haber ambigüedad y donde nos serviría la aclaración: predial, permisos de construcción, licencias comerciales, quejas ciudadanas.

**Por qué lo necesitamos:** las fichas del portal describen el trámite pero no distinguen entre "consulta" y "pago", ni entre las áreas que colaboran en un mismo proceso. Sin esta guía, Nia orienta con lo mejor que tiene pero puede mandar al ciudadano al área equivocada.

**Formato:** una tabla o documento con la aclaración por trámite.

### 4. Fichas de trámites que no están publicados

**Qué necesitamos:** cualquier trámite o servicio municipal que se atienda seguido pero **no esté publicado** en `santiago.gob.mx/servicios`. Si internamente hay un instructivo, checklist o folleto que se usa en ventanilla y no está en el portal, ese material es exactamente lo que necesitamos.

**Por qué lo necesitamos:** los trámites del portal ya están cargados. Los que no están publicados, Nia no los conoce y va a decir "no tengo esa información".

**Formato:** los PDFs internos se pueden subir tal cual. Word o Excel también sirven.

### 5. Lista de palabras que Nia no debe usar (opcional pero recomendado)

**Qué necesitamos:** cualquier palabra, sigla o expresión que el municipio prefiera que Nia nunca use al hablar con ciudadanos.

**Por qué:** es la forma correcta de configurar restricciones de lenguaje, sin depender de que el ciudadano las pida en cada llamada. Una vez cargadas, aplican en todas las llamadas de forma permanente.

**Formato:** una lista simple en correo o Word. Por ejemplo: "no digas 'reclamo', usa 'queja ciudadana'; no menciones a otros municipios; no digas 'inspector', usa 'personal de verificación'".

---

**Cuánto tarda cargar cada documento:** Centinelia procesa e incorpora cada archivo al conocimiento de Nia en pocos minutos. Del lado del municipio, solo se requiere el tiempo de compartirnos los archivos.

**Qué pasa mientras no llegan:** Nia va a decir honestamente "no tengo esa información" en los temas que dependen de estos documentos (nombres del personal, servicios fuera de su alcance, a qué área va cada consulta). No inventa datos y no confirma transferencias a áreas equivocadas. Preferimos que el ciudadano escuche "déjeme orientarle mejor con la información oficial actualizada" a que reciba una respuesta imprecisa.

---

## Consideración final

Las observaciones caen en tres grupos, y la mayoría son limitaciones esperadas por tratarse de un demo, no fallos del producto:

- **Resueltas en el demo y en producción:** 1.1, 1.2 y 2.1. Ya viven en el servicio y aplican en cada llamada.
- **Esperadas en demo, se resuelven al conectar con la central del municipio:** 1.3 y parte de 3.2. En el demo no hay a dónde transferir; en producción sí.
- **Dependen de información o configuración que solo el municipio puede compartir:** 1.4 (ya activada, con opción de conectarla con el sistema de expedientes ciudadanos si el municipio quiere), 2.2, 2.3, 3.1, 3.2 en la parte del directorio, y 4.1. Nia responde con lo que sabe. Sin el directorio del personal, la guía de derivación, la lista de servicios que no son municipales y las palabras a evitar, no puede responder con la precisión de un servidor público experimentado. Esa información no está en el portal público, así que Centinelia no puede inventarla.

Un demo es la prueba de que la tecnología funciona con la información que tiene. Con la información oficial completa y la conexión a los sistemas del municipio, Nia responde con la misma precisión que un servidor público con toda la documentación a la mano, y transfiere a la persona correcta en cada llamada.

Quedamos a la orden para agendar la carga de la información una vez que el municipio la tenga lista.

---

*Documento generado el 26 de septiembre de 2026 por el equipo Centinelia como respuesta al Informe de Observaciones y Oportunidades de Mejora en la Atención Telefónica.*
