# Pre-reunión lunes 2026-10-05, 10:00 AM — Americo (IPark) + equipo dev

Documento de arranque para la reunión. Léelo el domingo por la tarde para llegar centrado el lunes. Contiene elevator pitch, diagrama de flujo para compartir pantalla al abrir, agenda estructurada por bloques, y plantilla de action items para llenar al cerrar.

---

## Elevator pitch (60 segundos para abrir)

Para cuando lleguen miembros del equipo de IPark que no están al tanto del contexto completo. Léelo o adáptalo según el flow de las intros.

> Buen día a todos. Soy Nazre, fundador de Centinelia. Nosotros construimos empleados digitales para PyMEs y empresas medianas en México, mayoritariamente en Monterrey.
>
> El caso con IPark es el siguiente: ustedes reciben aproximadamente mil correos al mes de clientes que no pudieron facturar por el portal de autoservicio y escriben pidiendo su CFDI al inbox de facturación. Hoy un equipo humano los resuelve manualmente.
>
> Lo que proponemos es levantar a Nala, nuestra empleada digital de facturación. Nala vive conectada al inbox, lee cada correo que entra, decide si es solicitud de factura o no, y extrae los datos fiscales del cliente. Si el correo original no trae todos los datos necesarios (por ejemplo, falta régimen fiscal, uso CFDI o código postal), Nala responde al cliente pidiendo solo lo faltante, no bombardea con un formulario. Cuando el cliente responde, Nala toma la información nueva y continúa el flujo. Una vez tiene todos los datos, dispara el timbrado usando el Conector C1 de InvoiceOne que ustedes ya operan, recupera el XML y el PDF, y responde al cliente final.
>
> Para la parte técnica, traemos tres opciones de arquitectura sobre la mesa. Van desde un endpoint HTTPS que ustedes construyen y absorbe toda la complejidad, hasta un modelo donde ustedes solo depositan el TXT y nosotros recogemos los archivos resultantes de su carpeta de salida. Las vemos en detalle para que ustedes elijan cuál les cuadra mejor con su infraestructura actual.
>
> La propuesta técnica que trajo Americo, de que ustedes expongan un endpoint HTTPS frente al Conector y Centinelia solo postee JSON, nos parece la arquitectura correcta. Simplifica integración para nosotros y les da control a ustedes sobre qué entra al Conector.
>
> Hoy estamos aquí para tres cosas: alinear ese contrato técnico, confirmar la nomenclatura de Serie para trazabilidad, y acordar cronograma. Ya tenemos documentado el JSON que mandaríamos nosotros y el TXT que su endpoint produciría internamente, para que podamos ir al detalle rápido.

Si prefieres más corto: usa solo los primeros 2 párrafos.

---

## Las 3 opciones de arquitectura

Tres variantes posibles de cómo se conectan Centinelia e IPark. Todas usan el mismo Conector C1 de InvoiceOne por abajo; lo que cambia es qué pedazo del flujo vive de cada lado.

### Comparación rápida

| Dimensión | Opción A: Endpoint HTTPS mediado | Opción B: SFTP a /salida/ | Opción C: Sub-carpeta CEN dedicada |
|---|---|---|---|
| Qué construye IPark | Endpoint HTTPS complejo (drop + file watch + parser XML/PDF/error) | Endpoint HTTPS mínimo (drop + ack) | Endpoint mínimo + config de ruteo por Serie en Conector |
| Qué construye Centinelia | Cliente HTTPS simple | Cliente HTTPS + txt-builder + cron SFTP poller | Cliente HTTPS + txt-builder + cron SFTP poller |
| Dónde se arma el TXT | Endpoint IPark | Centinelia | Centinelia |
| Cómo Centinelia detecta éxito | Response HTTPS del endpoint | Cron SFTP ve XML+PDF en /salida/ | Cron SFTP ve XML+PDF en /salida/centinelia/ |
| Acceso Centinelia a filesystem IPark | Ninguno | Carpeta /salida/ completa | Solo sub-carpeta /salida/centinelia/ |
| Riesgo de seguridad | Mínimo | Alto (vista a todas las facturas IPark) | Medio (aislado por sub-carpeta) |
| Esfuerzo total implementación | IPark alto · Centinelia medio | IPark mínimo · Centinelia alto | IPark bajo-medio · Centinelia alto |
| Tiempo hasta primer timbrado prod | 6-8 semanas | 4-5 semanas | 5-6 semanas |

### Observación operativa

Hoy IPark ya tiene humanos extrayendo facturas de la carpeta `/salida/` del Conector para enviarlas por correo manualmente. Las Opciones B y C básicamente convierten a Nala en un "humano digital" que hace lo mismo: polea la carpeta, recoge archivos nuevos, los envía al cliente final. Reusan el patrón operativo existente, no inventan uno nuevo. La Opción A rompe ese patrón porque requiere que el endpoint parsee los archivos y los devuelva vía HTTPS, lo cual es nuevo trabajo.

### Recomendación de Centinelia

Preferimos Opción C si InvoiceOne confirma que el Conector soporta sub-carpetas por Serie (o si IPark puede correr un script auxiliar que mueva los archivos con prefijo `FEcen_` a una sub-carpeta). Si no se puede, Opción B con acuerdo explícito de que Nala solo lee archivos con prefijo `FEcen_*`. Opción A sigue siendo válida si IPark prefiere no dar acceso a filesystem bajo ninguna circunstancia.

**La decisión es de IPark, no nuestra.** Nosotros nos adaptamos a lo que les cuadre mejor con su infraestructura y políticas de seguridad.

---

```flow:A
heading = Flujo Opción A — Endpoint IPark absorbe toda la complejidad
description = En esta variante IPark construye un endpoint HTTPS que recibe JSON de Centinelia, arma el TXT internamente, lo deposita en el Conector, hace file-watch de la carpeta de salida, parsea XML+PDF o el .error.txt, y nos devuelve el resultado completo vía HTTPS. Centinelia nunca toca filesystem.
1 | Cliente final | Correo entra al inbox | Reenviado automáticamente del inbox de facturación IPark hacia Nala
-> reenvío automático
2 | Centinelia | Nala extrae datos fiscales | Lee correo y decide si es facturación · Extrae RFC, régimen, uso CFDI, CP · Valida CFDI 4.0 · Calcula hash de idempotencia | side=Si falta info, Nala responde pidiendo solo lo faltante y espera respuesta antes de continuar
-> POST HTTPS JSON con Authorization + Idempotency-Key
3 | IPark | Endpoint recibe y arma TXT | Valida auth y payload · Asigna folio Serie CEN (contador atómico) · Arma TXT layout C1 pipe-delimited · Escribe FE[nombre].txt en /entrada/ · File-watch de /salida/
-> archivo TXT depositado en /entrada/
4 | InvoiceOne | Conector C1 timbra | File watcher detecta archivo · Timbra contra EasyOne SAT · Éxito: XML + PDF en /salida/ · Error: .error.txt con motivo · Mueve TXT original a /procesados/
-> archivos resultantes aparecen en /salida/
5 | IPark | Endpoint detecta y responde | Lee XML+PDF o .error.txt del file-watch · Traduce a response HTTPS: 200 OK con UUID + XML + PDF base64, o 400/502/503 según tipo de error
-> response HTTPS a Centinelia
6 | Centinelia | Nala envía al cliente | Si éxito: envía XML + PDF al cliente final por correo · Si error: escala a humano con detalle · Loguea en portal Centinelia
```

```flow:B
heading = Flujo Opción B/C — Nala recoge archivos de la carpeta como humano digital
description = Variante más alineada con el patrón operativo actual de IPark: su endpoint solo deposita el TXT en el Conector, Nala polea la carpeta de salida vía SFTP como un humano digital. En Opción B, Nala filtra por prefijo FEcen_ en toda /salida/. En Opción C, el Conector o un script auxiliar rutea los FEcen_ a /salida/centinelia/ dedicada.
1 | Cliente final | Correo entra al inbox | Reenviado automáticamente del inbox de facturación IPark hacia Nala
-> reenvío automático
2 | Centinelia | Nala extrae y arma TXT | Lee correo y decide si es facturación · Extrae RFC, régimen, uso CFDI, CP · Arma TXT layout C1 con txt-builder · Nombra archivo FEcen_<folio>_<hash> | side=Si falta info, Nala responde pidiendo solo lo faltante y espera respuesta antes de continuar
-> POST HTTPS JSON (o TXT ya armado)
3 | IPark | Endpoint mínimo solo deposita | Valida auth · Escribe TXT en /entrada/ del Conector · Responde inmediato con status dropped + filename
-> archivo en /entrada/ del Conector
4 | InvoiceOne | Conector C1 timbra | File watcher detecta archivo · Timbra contra EasyOne SAT · XML + PDF caen en /salida/ (Opción C: en /salida/centinelia/) · O .error.txt si hay fallo
-> archivos aparecen en carpeta de salida
5 | Centinelia | Nala polea SFTP y envía | Cron cada 60-120s revisa la carpeta de salida · Filtra solo archivos FEcen_* · Al ver XML+PDF: descarga y asocia con correo original por nombre · Al ver .error.txt: parsea motivo y escala a humano · Envía XML + PDF al cliente final
```

---

## Agenda del Meet (60 minutos)

Estructura sugerida. Ajusta en vivo según cómo fluya la conversación, pero mantén los bloques como marco mental.

### Bloque 1 — Intros y confirmación de asistentes (0-5 min)

- Centinelia: Nazre Assad (owner).
- IPark/Embia: Americo Medina + equipo de desarrollo que él convoque.
- Confirmar roles de cada quien en la decisión técnica.

### Bloque 2 — Alcance y confirmación de interlocutor comercial (5-10 min)

**Encuadre antes de tocar detalles técnicos.** Objetivo: que todos los asistentes sepan a qué nivel de proyecto nos referimos y que confirmemos con quién de IPark se evalúa la parte comercial. No decidimos nada en vivo, solo alineamos para que no haya sorpresas al final.

- Qué estamos proponiendo construir: automatización completa del inbox de facturación de IPark con Nala, nuestra empleada digital, integrada vía el Conector C1 de InvoiceOne.
- Qué requiere de ambos lados: trabajo de desarrollo de Centinelia (adapter + integración) + trabajo de IPark (endpoint propio o acceso SFTP según opción). Es un proyecto formal, no un demo extendido gratis.
- **Confirmar quién evalúa la parte comercial.** El primer contacto de Nazre con IPark fue vía Francisco Chapa (quien compartió el dato de volumen de 1,000 correos/mes). Americo entró al hilo después como responsable del convenio con InvoiceOne. Pregunta clave para abrir en vivo: *"Americo, antes de meternos de lleno a lo técnico: ¿contigo también se ve la parte comercial del proyecto, o la propuesta de inversión mejor la mandamos por correo a Francisco o a quien autorice ese tipo de decisiones en IPark?"*. La respuesta define qué pasa en el Bloque 5:
  - Si Americo es también interlocutor comercial o quiere verla: cotización en vivo en Bloque 5.
  - Si no: solo timeline + próximos pasos en vivo; cotización se manda por correo al contacto correcto esta semana.
- Centinelia trae a esta reunión: propuesta técnica detallada (próximos bloques) + propuesta comercial lista para compartir al final o por correo según corresponda.
- Si notan que el scope es mayor del que esperaban, tenemos una **alternativa de POC mínimo** preparada por si prefieren validar valor con menor riesgo antes de comprometer dev de ambos lados.
- **Esta reunión no requiere decisiones de compromiso en vivo.** El objetivo es que ambos equipos se vayan con claridad del scope técnico, timeline, posibles rutas de inversión, y puedan evaluar internamente con sus criterios y con quien corresponda del lado de IPark.

### Bloque 3 — Decisión arquitectural y Serie (10-25 min)

**Esta es la decisión técnica más importante.** Presentar las 3 opciones de arquitectura con la tabla comparativa de arriba. Explicar el contexto operativo: hoy IPark ya tiene humanos extrayendo facturas de la carpeta de salida del Conector. Las Opciones B y C reusan ese patrón; Opción A inventa uno nuevo.

- Compartir pantalla con la sección "Las 3 opciones de arquitectura" + los 2 diagramas.
- Preguntas específicas a resolver con Americo + equipo dev:
  1. ¿Qué prefieren: endpoint HTTPS que absorbe todo (A), endpoint mínimo + SFTP de salida compartido (B), o sub-carpeta dedicada para Serie CEN (C)?
  2. Si eligen B o C: ¿pueden otorgar acceso SFTP a `/salida/` (o la sub-carpeta)? ¿Qué credenciales usarían?
  3. Si eligen C: ¿InvoiceOne les ha dicho si el Conector soporta ruteo de output por Serie, o necesitarían un script auxiliar?
  4. ¿Cuál les resulta más rápido de implementar de su lado?
- Nomenclatura de Serie: proponemos `CEN`. Si choca con sus convenciones internas, alternativas: `AI`, `BOT`, `NAL`. Acordar en vivo.
- Rango de folios para la Serie elegida.
- Contador de folios: en A lo lleva su endpoint, en B/C lo lleva Centinelia (nosotros tenemos el hash de idempotencia listo).

Si quedan empatados o indecisos, nuestra recomendación es Opción C (balance de simplicidad + seguridad).

### Bloque 4 — Contrato JSON y casos edge (25-40 min)

- Compartir pantalla con `08-endpoint-json-propuesta.md` y `09-txt-layout-c1-ejemplo-fixture1.md` lado a lado.
- Repasar el JSON ejemplo del fixture #1 (Grupo Mex) y el TXT que su endpoint produciría. Validar que los campos cuadran con lo que necesitan.
- Autenticación, response síncrono vs asíncrono, idempotencia, multi-RFC emisor, correo final al cliente.
- Casos edge críticos (de `10-txt-ejemplos-casos-edge.md`):
  - **Nota de crédito (fixture #12):** TipoDocumento `E` + CFDI_RELACION. ¿Pueden buscar UUID original dado un folio_boleto o Centinelia debe guardarlo?
  - **Público en general (fixture #11):** XAXX010101000, régimen 616, uso S01. Confirmar patrón.
  - **Multi-concepto / múltiples boletos:** 1 CFDI con N conceptos o N CFDIs. Preferencia operativa.
  - **Cliente pre-pago (fixture #15):** boleto sin cobro final. ¿Sistema notifica o Centinelia polea?

### Bloque 5 — Timeline, inversión y pasos siguientes (40-55 min)

**Si en Bloque 2 Americo confirmó que la parte comercial se puede ver con él, presentamos la cotización en vivo.** Compartir pantalla con `11-cotizacion-ipark-propuesta.md`. Explicar de forma transparente los 3 componentes del costo:

1. **Desarrollo del adapter Conector C1:** $150,000 MXN one-time. Trabajo de Centinelia para construir la integración (cliente HTTPS, txt-builder, response handler, idempotencia, pre-flight validation, tests E2E, docs). Pagadero 50% al kickoff + 50% al primer timbrado prod.
2. **Setup / onboarding:** $14,990 MXN one-time al kickoff.
3. **Mensualidad Nala IPark:** $11,988 MXN/mes (plan Jornada Tareas Alta Demanda, 3,000 ops incluidas, overage $8.5/op). Comparable con costo manual actual estimado ($20-30K MXN/mes).

**Total POC 3 meses: $200,954 MXN.** Punto de equilibrio ~9-12 meses vs. proceso manual actual.

- Mencionar que existe **Alternativa B** (desarrollo diluido en mensualidad primeros 6 meses, sin pago fuerte inicial) si prefieren esa estructura.
- Mencionar que existe **Opción 0 - POC mínimo** si prefieren validar valor con menor compromiso: ~$45K total, 2-3 semanas, Nala corre contra correos reales SIN tocar el Conector real, reporte semanal con precisión real medida. Si deciden continuar al proyecto completo, los $45K se acreditan contra el desarrollo.
- Lo que Centinelia necesita de IPark (checklist completo en `07-*.md`):
  - URLs sandbox + producción del endpoint
  - Credenciales de autenticación
  - Alta de Serie en EasyOne con rango de folios
  - Correo de pruebas (alias no en uso que reenvíe a `ipark-demo@centinelia.mx`)
  - Contacto técnico directo para integración
- Timeline: primer timbrado sandbox 4-6 semanas desde kickoff. Arranque productivo 6-8 semanas desde kickoff.

**Dejar claro: no esperamos decisión en vivo.** Les mandamos propuesta formal firmable por correo esta misma semana al contacto comercial que Americo confirme (él, Francisco, o Dirección), para que la revisen con tiempo con su equipo de finanzas.

**Si en Bloque 2 Americo dijo que lo comercial se ve con otro contacto (Francisco u otro):** NO mostrar la cotización en pantalla. Solo cubrir timeline + próximos pasos técnicos. Al cerrar, mencionar que la propuesta formal con cotización va por correo esta misma semana al contacto que Americo nos pase. Mejor así que forzar algo que no cae en su cancha.

### Bloque 6 — Action items y cierre (55-60 min)

- Revisar la lista de action items (ver plantilla abajo).
- Acordar canal y fecha del próximo contacto para follow-up comercial.
- Agradecer la disposición del equipo.

---

## Plantilla de minuta (para llenar en vivo al cerrar)

Copia esta plantilla a un documento aparte durante la reunión, llena en vivo, y mándala por correo a todos los asistentes en los 10 minutos siguientes al cierre. Mantiene momentum y evita malentendidos.

```minuta
# Reunión Centinelia + IPark · 2026-10-05, 10:00 AM MX

## Asistentes
- IPark/Embia: [nombres y roles]
- Centinelia: Nazre Assad

## Decisiones acordadas
1. Arquitectura elegida: [A endpoint HTTPS mediado / B SFTP compartido / C sub-carpeta CEN dedicada]
2. Serie fiscal: [CEN / otra]
3. Contador de folios: [IPark lo administra / Centinelia lo administra]
4. Autenticación del endpoint: [bearer / API key / mTLS]
5. Si Opción A, modelo de response: [síncrono / asíncrono con poll_url]
6. Si Opción B o C, acceso SFTP de Centinelia a: [ruta exacta y tipo de credencial]
7. Multi-RFC emisor: [API key por RFC / parámetro en body / endpoint por RFC]
8. Correo final al cliente lo envía: [IPark / Centinelia]
9. Idempotencia: [header Idempotency-Key honrado 24h / otro mecanismo]

## Action items

| # | Qué | Quién | Para cuándo |
|---|-----|-------|-------------|
| 1 | Compartir URL sandbox endpoint y credenciales de prueba | IPark (equipo dev) | [fecha] |
| 2 | Alta de Serie CEN en EasyOne con rango de folios | IPark (Americo) | [fecha] |
| 3 | Configurar alias de correo de pruebas reenviando a ipark-demo@centinelia.mx | IPark (Americo) | [fecha] |
| 4 | Mandar propuesta comercial formal | Centinelia (Nazre) | [fecha] |
| 5 | Mandar NDA mutuo para firma | [a definir] | [fecha] |
| 6 | Primer timbrado de prueba E2E con fixture #1 | Centinelia + IPark | [fecha] |

## Preguntas abiertas

Las que no se resolvieron en la llamada y que quedan para intercambio por correo o siguiente reunión.

- [pregunta 1]
- [pregunta 2]

## Siguiente contacto

- Fecha: [fecha]
- Canal: [Meet / llamada / correo]
- Objetivo: [tema a resolver]
```

---

## Notas rápidas de contexto para no perder el hilo

- **Americo propuso endpoint HTTPS en WhatsApp el viernes.** Eso es la Opción A. Pero al revisar que IPark ya opera manualmente desde la carpeta de salida del Conector, surge la hipótesis de Opción B/C donde ese patrón se reusa en vez de inventar uno nuevo. Las 3 opciones viables, la elegida depende de preferencia de IPark.
- **Si eligen Opción B o C**, el `txt-builder` se mueve a nuestro lado del endpoint. Ya está prototipado en TS con 8 tests verdes (`tests/lib/invoicing/c1-txt-builder-design.test.ts`), se refactoriza a `src/lib/invoicing/invoiceone/c1-connector/txt-builder.ts` en ~2 horas.
- **InvoiceOne ya respondió** las 16 preguntas técnicas del viernes. El Conector es puro file-based (3 carpetas, UTF-8, no webhook, no reintentos). Mencionarlo al abrir para que el equipo de dev de IPark sepa que ya tienen contexto suficiente.
- **El correo de pruebas de IPark quedó pendiente** (Americo no lo contestó en WhatsApp). Es el punto 4 del checklist. Si no sale orgánico en la reunión, pregúntalo explícitamente antes de cerrar.
- **El tema del precio** probablemente no sale en esta reunión (es técnica), pero la cotización está lista por si lo preguntan. Mensualidad $11,988/mes (Jornada Tareas - Alta Demanda, 3,000 ops incluidas). La cotización técnica (horas de desarrollo) se ajustará ligeramente según la opción elegida: A requiere más trabajo nuestro de cliente HTTPS robusto, B/C requiere más trabajo nuestro de cron SFTP + txt-builder productivo. Rango similar en ambos casos.

---

## Chequeo rápido antes de conectarte (3 minutos)

Antes de las 10 AM el lunes:
- Abrir carpeta `demos/ipark/` con los 12 docs listos.
- Dejar `08-endpoint-json-propuesta.md`, `09-txt-layout-c1-ejemplo-fixture1.md`, `10-txt-ejemplos-casos-edge.md` en pestañas separadas listas para pantalla compartida.
- Tener este documento (`12-pre-meeting-lunes.md`) abierto en una pantalla secundaria o impreso.
- Agua, auricular con mic probado, cámara con buena luz.
- Confirmar liga del Meet (Americo iba a mandártela por WhatsApp).
