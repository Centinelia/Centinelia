# Guion detallado 15-sept — Nelia soporte + Niva compliance

Papel que traes impreso (o abierto en el celular) el dia de la cita.

Formato: `NAZRE:` es lo que dices verbatim. `ACCION:` es lo que haces en pantalla. `ESPERAR:` lo que probablemente pasa. `FALLBACK:` que hacer si algo se cae.

---

## Metadata de la sesion

| Campo | Valor |
|---|---|
| Fecha | Lunes 15 de septiembre de 2026 |
| Duracion objetivo | 45-50 min |
| Asistentes esperados | Gerardo Guajardo (operaciones), posiblemente Alan (CEO) + Emilio (CTO) |
| Quien opera pantalla | Nazre |
| Backup | Loom grabado sabado 13 (5 bloques) |
| URL principal | `demo.centinelia.mx/meefi` (o path equivalente) |
| Portal Meefi | `centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados` |

---

## Pre-flight Nazre (5 min antes de que lleguen)

- [ ] Laptop conectada a corriente, brillo al 100%
- [ ] Hotspot activo y probado
- [ ] Cable HDMI + adaptador USB-C en la maleta
- [ ] Chrome con 4 tabs abiertas en este orden:
  1. `demo.centinelia.mx/meefi?scenario=2` — bloque HERO listo para arrancar
  2. Gmail de Nazre abierto, filtro `to:nazre20+` visible
  3. `centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados` — para hablar del backend si Gera pregunta
  4. Loom fallback en tab dormida
- [ ] Las 4 imagenes Intercom mock descargadas y accesibles en `public/demo/meefi/intercom-mock-1.png` a `4.png`
- [ ] `public/demo/meefi/slack-mock.png` descargada
- [ ] Modo No molestar activo, notificaciones silenciadas
- [ ] Kill switch en clipboard por si algo se sale de control:
  ```sql
  UPDATE organizations SET demo_paused = TRUE WHERE portal_email = 'meefi-demo@centinelia.mx';
  ```
- [ ] Confirmar `demo_paused = false` (query rapida)
- [ ] Nash silenciado: `UPDATE organizations SET pilot_notify_email = NULL WHERE portal_email = 'meefi-demo@centinelia.mx';`

---

## Apertura (min 0-5)

### Beat 0.1 — Entrada (min 0-2)

Saludo natural. Sin pitch de entrada. Si Alan y Emilio estan, les das la mano y confirmas nombres.

NAZRE: "Cuando platicamos hace dos semanas me comentaste que el chatbot de Intercom escala practicamente todo. Eso me quedo muy grabado. Hoy les voy a mostrar como se ve ese mismo equipo de soporte cuando tiene herramientas reales, no solo FAQ. Empezamos por Nelia."

ESPERAR: Gera asiente. Alan y Emilio escuchan.

NAZRE (si Alan o Emilio no conocen el contexto): "Nelia es la persona que atiende los tickets de soporte de sus usuarios. Hoy ese rol lo tienen Ashley, Emilio y Jaime en rotacion. Nelia no reemplaza a su equipo en casos que requieren criterio humano, pero si resuelve el 60-80% que hoy escala sin necesidad."

### Beat 0.2 — Contexto del contraste (min 2-4)

NAZRE: "Voy a mostrarles 4 casos que representan las quejas mas comunes de sus usuarios. Antes de cada uno les enseno como los resuelve Intercom hoy. Luego como los resuelve Nelia. No es video, es en vivo."

NAZRE: "Y al final les muestro un quinto caso con Niva, que aplica la misma logica pero para el lado de compliance, relevante por el Head of Compliance que estan contratando."

ACCION: asegurarte de que todos ven la pantalla comoda. Ajustar angulo si hace falta.

### Beat 0.3 — Instruccion de observacion (min 4-5)

NAZRE: "No necesitan hacer nada, yo opero la pantalla. Si en algun momento quieren que pare o repita algo, me dicen. La idea es que al final tengan claro si esto resuelve el problema que Gera me platico."

---

## Bloque 1 -- Resolucion de cuenta (min 5-13)

### Beat 1.0 — Contraste Intercom (min 5-6)

ACCION: mostrar `intercom-mock-1.png` en pantalla completa por 3 segundos. Es el screenshot del chatbot Intercom respondiendo con link de reset generico sin diagnostico.

NAZRE: "Esto es lo que recibe hoy el usuario cuando escribe que no puede cambiar su contrasena. Un link generico. Sin saber si la cuenta esta bloqueada, sin saber por que, sin guiar al usuario. El usuario hace clic, no funciona, y escala."

ACCION: cerrar la imagen.

### Beat 1.1 — Abrir scenario 1 (min 6-7)

ACCION: abrir `demo.centinelia.mx/meefi?scenario=1` en la tab de Chrome. El widget flotante de Nelia aparece abajo-derecha.

NAZRE: "El mismo caso, ahora con Nelia."

ACCION: en el chat del widget, escribir y enviar:
> "Hola, no puedo cambiar mi contrasena. Ya intente varias veces y el link no me funciona."

### Beat 1.2 — Dejar que Nelia diagnostique (min 7-10)

ACCION: silencio. Nelia responde. Cuando Nelia haga el `lookup_user_account` y empiece a diagnosticar, senalar en voz baja:

NAZRE: "Ahi esta consultando la cuenta. Ve el flag `password_reset_locked` activado. Ahora sabe el motivo real."

ESPERAR: Nelia explica que la cuenta no esta verificada (`identity_verified=false`) y le pide al usuario que confirme su correo de bienvenida.

NAZRE (mientras Nelia guia): "Intercom no sabe esto. Nelia si, porque tiene acceso a los flags reales de la cuenta."

### Beat 1.3 — Confirmacion y envio del link (min 10-12)

ACCION: en el chat, escribir como usuario:
> "Ya confirme mi correo, ahora si."

ESPERAR: Nelia llama `send_password_reset_link`, confirma el envio con el correo destino y vigencia de 60 minutos.

NAZRE: "Link enviado, con el correo destino y la vigencia. El usuario sabe exactamente que hacer y cuanto tiempo tiene. Tres turnos, caso cerrado."

### Beat 1.4 — Cierre del bloque (min 12-13)

NAZRE: "La diferencia no es velocidad. Es diagnostico. Intercom manda el link y cruza los dedos. Nelia entiende por que no funciona y guia el paso correcto."

FALLBACK Bloque 1: si el chat no responde en 15 segundos o Nelia no llama `lookup_user_account`, abrir el Loom del bloque 1 en la tab dormida y decir: "Les enseno la grabacion del ensayo del sabado, exactamente el mismo caso." Reproducir desde el segundo 0 del bloque.

---

## Bloque 2 -- Transferencia no reflejada (HERO) (min 13-23)

### Beat 2.0 — Contraste Intercom (min 13-14)

ACCION: mostrar `intercom-mock-2.png` por 3 segundos. El chatbot de Intercom dice "voy a transferirte con Emilio, un momento" sin dar ninguna informacion del estado de la transferencia.

NAZRE: "Este es el caso que mas tiempo consume al equipo. El usuario transfiere, no ve el dinero, entra en panico, y Intercom los escala directo a Emilio sin contexto. Emilio tiene que preguntar monto, fecha, referencia, banco destino. Todo desde cero."

ACCION: cerrar la imagen.

### Beat 2.1 — Abrir scenario 2 (min 14-15)

ACCION: abrir `demo.centinelia.mx/meefi?scenario=2`.

NAZRE: "El mismo caso."

ACCION: en el chat, escribir:
> "Hice una transferencia de 50 mil pesos hace como dos horas y no me aparece en mi cuenta. Necesito saber que paso."

### Beat 2.2 — Primer diagnostico de Nelia (min 15-17)

ACCION: silencio. Nelia llama `check_transfer_status`.

NAZRE (mientras responde): "Nelia esta consultando el estado de la transferencia. No necesito que el usuario busque ningun ID, Nelia infiere por monto y tiempo aproximado."

ESPERAR: Nelia responde con estado `pendiente_rieles`, explicacion del proceso y ETA. No escala.

NAZRE: "Estado claro, explicacion del proceso, tiempo estimado. Sin escalar, porque no hay urgencia todavia. Si el usuario esta bien con eso, el ticket cierra aqui."

### Beat 2.3 — Escalamiento por urgencia (min 17-20)

ACCION: en el chat, escribir como usuario:
> "Es que es urgente. Es un pago a un proveedor y tiene cierre de operaciones hoy a las 5."

ESPERAR: Nelia detecta la urgencia, llama `escalate_to_human` con `topic=transferencia_urgente` y `priority=alta`. Incluye en el contexto el monto, fecha, estado, y el motivo de urgencia.

NAZRE: "La diferencia. En el primer turno no escalo porque no habia urgencia. En el segundo turno el usuario declaro urgencia, Nelia la detecto, y ahora si escala."

NAZRE (pivota a Gmail en la segunda tab, cambiar de tab): "Esto es lo que Emilio ve."

### Beat 2.4 — Correo de escalamiento en Gmail (min 20-22)

ACCION: en Gmail, mostrar el correo que llego a `nazre20+emilio@gmail.com` en los ultimos 30 segundos. Asunto con `[Meefi Soporte · alta] transferencia_urgente`.

NAZRE: "Contexto completo. Nombre del usuario, correo, estado de la cuenta, los ultimos turnos de conversacion, la hipotesis de Nelia sobre que paso, y la accion sugerida. Emilio no tiene que preguntar nada, actua directo."

ACCION: abrir el correo y mostrar las secciones: contexto usuario, conversacion, hipotesis, accion sugerida. No leer todo, solo senalar los encabezados.

NAZRE: "Si esto llega a Slack en vez de correo, igual funciona. Les muestro eso al final del siguiente bloque."

### Beat 2.5 — Cierre del bloque (min 22-23)

NAZRE: "Intercom escala sin contexto. Emilio recibe un ticket y tiene que investigar desde cero. Con Nelia, Emilio recibe contexto estructurado y actua en segundos, no en minutos."

FALLBACK Bloque 2: si el chat no responde, mostrar Loom Bloque 2. Si el correo no llega en 20 segundos, decir "el correo esta saliendo, mientras tanto esto es exactamente lo que se ve cuando llega" y mostrar el screenshot pre-hecho del correo en `public/demo/meefi/correo-ejemplo.png`.

---

## Bloque 3 -- Consulta KB Help Center (min 23-28)

### Beat 3.0 — Contraste Intercom (min 23-24)

ACCION: mostrar `intercom-mock-3.png` por 3 segundos. Intercom responde "revisa nuestro Help Center" con link a la pagina raiz, sin apuntar al articulo correcto.

NAZRE: "Tiene el Help Center. Pero manda al usuario a buscar el articulo solo."

ACCION: cerrar la imagen.

### Beat 3.1 — Abrir scenario 3 (min 24-25)

ACCION: abrir `demo.centinelia.mx/meefi?scenario=3`.

ACCION: escribir en el chat:
> "Cuanto tiempo tarda una transferencia SPEI a otro banco?"

### Beat 3.2 — Respuesta con cita real (min 25-27)

ACCION: silencio. Nelia llama `search_help_center`.

ESPERAR: Nelia responde con 2-3 lineas literales del articulo del Help Center de Meefi y el link directo al articulo.

NAZRE: "Cita literal del articulo que ya tienen publicado. No lo invento. Nelia lee su Help Center y extrae la respuesta puntual. El link va al articulo especifico, no a la pagina raiz."

NAZRE: "Esto es informacion suya. Si manana actualizan el articulo, manana Nelia ya responde con los tiempos nuevos. Sin tener que reconfigurar nada."

### Beat 3.3 — Cierre del bloque (min 27-28)

NAZRE: "Todas las preguntas informativas que hoy escalan o mandan a buscar, Nelia las resuelve citando lo que ustedes ya tienen escrito. El equipo de soporte deja de recibir tickets sobre tiempos, comisiones, como agregar beneficiarios."

FALLBACK Bloque 3: si Nelia no llama `search_help_center` o inventa el contenido, decir: "El Help Center de Meefi aun no esta completamente ingerido, eso lo terminamos esta semana. La logica ya esta funcionando con el contenido que si esta cargado." Mostrar Loom Bloque 3 si hace falta.

---

## Bloque 4 -- 2FA perdido + escalamiento inteligente (min 28-38)

### Beat 4.0 — Contraste Intercom (min 28-29)

ACCION: mostrar `intercom-mock-4.png` por 3 segundos. Intercom dice "voy a transferirte con soporte" sin pedir ninguna evidencia.

NAZRE: "Este es el que mas tiempo consume a Ashley. El usuario dice perdio el celular, Intercom escala, Ashley tiene que pedir la documentacion desde cero, el usuario tiene que volver a describir todo. Un cycle time de 2-3 dias, muchas veces."

ACCION: cerrar la imagen.

### Beat 4.1 — Abrir scenario 4 (min 29-30)

ACCION: abrir `demo.centinelia.mx/meefi?scenario=4`.

ACCION: escribir en el chat:
> "Perdi el celular donde tenia el Authenticator. Ya no puedo entrar a mi cuenta."

### Beat 4.2 — Nelia inicia recovery y pide evidencia (min 30-33)

ACCION: silencio. Nelia llama `initiate_2fa_recovery`, genera un ticket ID, y pide las 4 evidencias en un solo mensaje.

ESPERAR que Nelia liste:
- INE frente (nitida, sin recortes)
- INE reverso
- Selfie sosteniendo la INE al lado de la cara
- Ultimos 4 digitos de la cuenta bancaria registrada en Meefi

NAZRE: "Un solo mensaje con exactamente lo que necesita. Nada mas. Sin pedir cosas de mas, sin escalar antes de tener lo que necesita."

### Beat 4.3 — Usuario sube evidencia (min 33-35)

NAZRE (verbatim a Gera): "Aqui el usuario sube las 3 fotos. Si quieren lo simulamos o lo narran."

ACCION: en el chat, escribir como usuario:
> "Listo, subi las tres fotos. Los ultimos 4 digitos son 4872."

### Beat 4.4 — Escalamiento con contexto completo (min 35-37)

ACCION: silencio. Nelia llama `escalate_to_human` con `topic=recovery_2fa`, arma el resumen con la evidencia recolectada y la hipotesis.

ESPERAR: Nelia informa al usuario el ticket ID y dice que Ashley responde en 4 horas habiles.

NAZRE: "Ticket creado. Evidencia completa adjunta. Ashley recibe todo lo que necesita para validar sin tener que pedir nada."

ACCION: cambiar a Gmail. Mostrar el correo que llego a `nazre20+ashley@gmail.com`. Asunto: `[Meefi Soporte · media] recovery_2fa`.

NAZRE: "Mismo formato que el de Emilio. Contexto, conversacion, evidencia, accion sugerida. Ashley no arranca desde cero."

### Beat 4.5 — Slack mock (min 37-38)

ACCION: mostrar `public/demo/meefi/slack-mock.png` en pantalla por 5 segundos.

NAZRE: "Esto tambien lo podemos aterrizar en su Slack. Mismo resumen ejecutivo, en el canal que quieran, con thread. Si tienen canales por tipo de caso, `#soporte-cuentas` para Ashley, `#soporte-tech` para Emilio, ya funciona con esa logica. Esto es un mock del formato, en produccion vive de verdad."

ACCION: cerrar la imagen.

FALLBACK Bloque 4: este es el bloque mas complejo. Si el chat no responde al iniciarlo, decir: "Les muestro la grabacion del ensayo del sabado, es el mismo flujo exacto." Abrir Loom Bloque 4. Si el correo a Ashley no llega, usar screenshot pre-hecho. Si Nelia escala antes de recolectar evidencia, decir: "El calibrador de Nelia esta ajustado al threshold de escalamiento; en este entorno de demo lo ajustamos en 5 minutos para que espere la evidencia completa."

---

## Bloque Niva -- Compliance (min 38-43)

### Beat N.0 — Transicion (min 38-39)

NAZRE: "Todo lo que vieron aplica a soporte. La misma logica de diagnostico, accion, escalamiento con contexto completo, aplica igual en compliance. Y esto es relevante porque van a tener un Head of Compliance nuevo entrando al equipo."

NAZRE: "El que llega no va a arrancar de cero. Niva ya esta operando debajo."

### Beat N.1 — Caso KYB (min 39-42)

ACCION: abrir la bandeja de Niva en el portal `centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados`, entrar al chat de Niva.

ACCION: escribir el prompt completo con el expediente inline. Niva necesita datos concretos para producir memo estructurado; si le mandas solo el nombre, va a pedir expediente (comportamiento defensivo correcto pero no genera el "wow output"). Alimentala con los datos y ella corre los checks:

> "Niva, tengo el expediente de Comercializadora Bajio SA de CV, importadora de refacciones de EEUU. Datos: representante legal Juan Perez Ramirez, INE vigente. RFC CBA850101ABC, opinion 32-D positiva al 2026-08-15, domicilio Monterrey NL vigente. BCF: Ana Sanchez Romero (65%, mexicana, residente MX) y Luis Ramirez Torres (35%, mexicano, residente MX). Volumen mensual estimado 300 mil USD, corredor USD-MXN, bancos origen BBVA-Banorte. Frecuencia semanal. Corre checks OFAC, UIF, PLD y screening PEP, dame el analisis con recomendacion para Sofia."

ACCION: silencio. Niva procesa.

ESPERAR: Niva genera un memo estructurado con:
- Sintesis del caso
- Checks: OFAC (limpio esperado), UIF/PLD (revision estandar), PEP screening (limpio en BCF con menos del 25% no aplica, pero Ana Sanchez con 65% sí)
- Alertas: BCF con participacion > 25% activa flag de revision enhanced
- Recomendacion: NO aprobar automaticamente por presencia de BCF con criterio de revision enhanced sobre el 65%. Escalar a Sofia con expediente pre-empacado.

NAZRE cuando Niva presente el memo: "Esta es la parte que le va a importar al Head of Compliance. Niva no aprobo sola. Detecto que Ana Sanchez, que controla el 65%, activa el threshold de revision enhanced. Un analista jr sin experiencia hubiera pasado por alto ese threshold porque son mexicanos ambos y sin flags OFAC."

NAZRE: "Y esto queda en expediente auditable. El Head of Compliance llega y ya tiene historial de los casos procesados, los criterios que se aplicaron, los escalamientos. Puede calibrar los thresholds si quiere."

**Nota Nazre**: si Niva pide mas info antes de decidir en vez de producir el memo, es comportamiento defensivo valido. En ese caso di verbatim: "Esta bien, mira lo que hace. Antes de decidir, te pide el expediente completo. Este es el opuesto del chatbot generico que aprueba cualquier cosa sin datos. Ahora se lo doy y proces." — y le pegas el expediente inline arriba en un segundo mensaje.

### Beat N.2 — Cierre del bloque (min 42-43)

NAZRE: "Tres semanas de operacion y Niva ya conoce los patrones de los leads de Meefi. Calibra sola conforme ve mas casos."

FALLBACK Bloque Niva: si el chat no responde, decir "el escenario de compliance es el mas pesado por el procesamiento de documentos; les enseno el Loom del ensayo donde corrio limpio." Si Niva aprueba sin escalar, decir: "En este entorno de demo la politica BCF no esta completamente cargada; en produccion esa politica la define el Head of Compliance y Niva la aplica exacta."

---

## Cierre comercial (min 43-50)

### Beat C.1 — Resumen y propuesta (min 43-46)

NAZRE: "Cinco casos. Los cuatro que mas escalan hoy a su equipo, mas el de compliance que va a ocupar al Head of Compliance que esta contratando."

NAZRE: "Lo que les propongo es un piloto de tres semanas. Semana uno: setup y calibracion de la KB con los articulos reales de su Help Center y los casos tipicos que Ashley, Emilio y Jaime atienden hoy. Semana dos: Nelia en shadow, observando y respondiendo en paralelo al equipo real. Semana tres: produccion, con el equipo revisando lo que hace Nelia y calibrando lo que no cuadre."

NAZRE: "En tres semanas tienen data suficiente para saber si redujo escalamientos y en cuanto."

### Beat C.2 — Precio (min 46-48)

**Si preguntan por precio**:

NAZRE: "Nelia es una Jornada Completa: $5,994 al mes mas IVA, con la incorporacion inicial de $14,990 mas IVA que cubre la configuracion de KB, las tools conectadas a sus datos y el onboarding de su equipo. El piloto de tres semanas entra en el primer mes."

NAZRE: "Si despues agregan a Niva para compliance, es un segundo empleado al mismo precio. Empresarial con volumen lo platicamos en la propuesta escrita."

NAZRE: "El 16 les mando propuesta escrita con los numeros exactos para el caso de ustedes."

### Beat C.3 — Objeciones anticipadas (min 48-50)

**"Que pasa si Nelia responde algo incorrecto?"**

NAZRE: "Tres controles. Primero, la KB operativa que ustedes le ponen: lo que Nelia puede y no puede afirmar lo definen ustedes. Segundo, logs auditables de cada respuesta, la pueden revisar cuando quieran. Tercero, escalamiento manual con un clic si algo no cuadra. El equipo no pierde control, gana tiempo."

**"Como se integra con su Intercom actual?"**

NAZRE: "Dos rutas. Reemplazo: Nelia vive donde vive Intercom hoy, sus usuarios no notan la diferencia de interfaz. Coexistencia: Nelia atiende ciertos temas, Intercom el resto. Si el KPI es reducir escalamientos, les recomiendo reemplazo directo porque la coexistencia divide el contexto."

**"Cuanto tiempo para tenerlo en produccion?"**

NAZRE: "Tres a cuatro semanas con calibracion real. Semana uno: setup mas ingesta de KB. Semana dos: dry runs con casos reales de su equipo. Semana tres: shadow con Ashley y Emilio revisando. Semana cuatro: produccion."

**"Van a reemplazar a Ashley o a Emilio?"**

NAZRE: "No. Nelia resuelve el 60-70% que hoy escala sin necesidad. Ashley y Emilio reciben el 30% que si requiere criterio humano, pero con contexto completo y sin haber gastado tiempo en los previos. Mismo equipo, mas tiempo en los casos que si importan."

**Objecion que no anticipamos**:

NAZRE: "Anoto la duda y la respondo por escrito el 16 con datos concretos."

### Beat C.4 — Pedido claro y siguiente paso (min 50)

NAZRE: "Una pregunta antes de cerrar: si esto tiene sentido para Meefi, quien quedaria como owner operativo del piloto, para saber con quien coordino el onboarding de KB y los primeros dry runs? Puede ser uno de ustedes tres, o los tres en distintos roles."

ESPERAR: alguno dice quien o preguntan como funciona el onboarding.

NAZRE: "Perfecto. El 16 les mando la propuesta con los numeros del caso de ustedes y el timeline del piloto. Si la revisan y les cuadra, coordinamos el arranque esa misma semana."

NAZRE: "Les dejo los tokens del portal por si quieren explorar lo que vieron hoy. Y cualquier pregunta que surja, por correo, cualquier hora."

---

## Post-cita (mismo dia)

- [ ] Anotar en un doc: que prometiste, que preguntaron sin respuesta, temperatura de interes (alta / media / baja por producto)
- [ ] Antes de las 8 PM: correo de cierre con proximos pasos exactos
- [ ] Si dijeron si a propuesta: agendar bloque el 16 en la manana para armarla antes de mediodia
- [ ] Reactivar Nash: `UPDATE organizations SET pilot_notify_email = 'nazre20@gmail.com' WHERE portal_email = 'meefi-demo@centinelia.mx';`
- [ ] Actualizar handoff prospecto Gerardo Guajardo con el resultado

---

## Relacionados

- `22-kb-nelia-meefi.md` -- KB operativa Nelia
- `13-guion-cita-15-sept.md` -- estructura estrategica (historico Nalu)
- `21-dry-run-runbook-nelia.md` -- runbook para los ensayos previos
- `docs/superpowers/specs/2026-09-10-demo-meefi-nelia-soporte-design.md` -- spec completo
