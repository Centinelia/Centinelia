# Checklist reunión Americo (IPark) — lunes 2026-10-05, 10:00 AM

Reunión convocada por Americo Medina (IPark/Embia) junto con su equipo de desarrollo, tras WhatsApp del viernes 2026-10-02 PM. Objetivo propuesto por Americo: definir la nomenclatura y alinear el flujo de generación de facturas de modo que no afecte la operación de sus sistemas internos.

Propuesta de arquitectura que Americo trajo a la mesa: IPark construye un **endpoint HTTPS propio** que vive frente al Conector C1 de InvoiceOne. Centinelia envía requests JSON a ese endpoint, IPark internamente arma el TXT layout C1 y lo deposita en su conector. Esto cambia radicalmente lo que necesitamos de ellos vs. el plan original de drop SFTP directo.

Este checklist cubre lo que necesitamos que IPark nos entregue para poder implementar del lado Centinelia.

## Insumos resueltos antes de la reunión

Respuesta de InvoiceOne (viernes 2026-10-02 PM) confirmó varios puntos técnicos del Conector C1 que ya no son preguntas abiertas:

- **3 carpetas** manejadas por el Conector: `/entrada/` (TXT fuente), `/procesados/` (TXT movido tras procesarse) y `/salida/` (XML + PDF resultantes). Rutas y nombres configurables por IPark.
- **No hay webhook ni callback.** El Conector es un file watcher: detecta el archivo nuevo y procesa automáticamente, sin polling programado.
- **Serie y folio NO los administra el Conector.** Deben venir dentro del TXT fuente. Esto significa que alguien (IPark o Centinelia) debe llevar el contador de folios externamente.
- **Retorno por nombre de archivo:** el XML y PDF resultantes conservan el mismo nombre base del TXT de entrada. Trivial correlacionar entrada ↔ salida.
- **Errores:** archivo `.error.txt` en la carpeta correspondiente con el motivo del fallo. **Sin reintentos automáticos** del Conector.
- **Encoding obligatorio: UTF-8.** Extensión: `.txt`.
- **Ambiente de pruebas YA activo** en los 2 servers de IPark. **400 timbres de prueba gratis**, extensibles bajo petición.
- **Layouts PDF entregados** (2026-10-02 PM). Procesados en `demos/ipark/09-txt-layout-c1-ejemplo-fixture1.md` con el TXT real para fixture #1 (Grupo Mex) + breakdown por sección + catálogos SAT usados.

Implicación: el endpoint HTTPS de Americo tiene que absorber toda la lógica de file-drop + file-watch + manejo de `.error.txt` del Conector del lado de IPark, y traducirla a códigos HTTP limpios para Centinelia. El TXT ejemplo nos permite entregar en la misma reunión un patrón concreto de lo que su endpoint debe producir internamente, no solo lo que Centinelia va a enviar.

---

## 0. Decisión arquitectural prioritaria (PRIMER BLOQUE DE LA REUNIÓN)

**Este es el punto más importante y hay que resolverlo antes de bajar al detalle de los demás temas.** Las respuestas a casi todo lo demás dependen de qué opción se elija.

Al revisar que hoy IPark ya tiene humanos extrayendo facturas de la carpeta de salida del Conector para enviarlas por correo, surge una hipótesis que simplifica mucho el lado de IPark: Nala puede operar como "humano digital" sobre esa misma carpeta en vez de requerir que IPark construya un endpoint que haga file-watch y parseo.

Tres opciones viables. La elegida define el resto del contrato técnico. Ver tabla completa de comparación en `12-pre-meeting-lunes.md` sección "Las 3 opciones de arquitectura".

### Opción A: Endpoint HTTPS mediado (lo que Americo propuso el viernes)

- IPark construye endpoint HTTPS que recibe JSON, arma TXT, lo deposita en Conector, hace file-watch de `/salida/`, parsea XML+PDF o `.error.txt`, devuelve response HTTPS a Centinelia.
- Contrato limpio tipo API (JSON in, JSON out).
- Pro: Centinelia nunca toca filesystem. Mínima superficie expuesta.
- Contra: IPark construye endpoint complejo. Rompe el patrón operativo que ya existe hoy.

### Opción B: SFTP compartido a `/salida/`

- IPark construye endpoint HTTPS mínimo que solo deposita el TXT y regresa `{status: dropped, filename}`. Después el Conector procesa normalmente y deja XML+PDF en `/salida/`.
- Centinelia tiene acceso SFTP a esa carpeta, polea cada 60-120s buscando archivos con prefijo `FEcen_*`.
- Pro: endpoint IPark es trivial. Reusa el patrón que humanos ya conocen (recoger de carpeta).
- Contra: Centinelia tiene vista a TODAS las facturas de IPark. Riesgo de seguridad.

### Opción C: Sub-carpeta dedicada `/salida/centinelia/`

- Igual que B, pero el Conector (o un script auxiliar) rutea archivos de Serie `CEN` a una sub-carpeta aislada. Nala solo tiene acceso a esa sub-carpeta.
- Pro: aisla visibilidad. Mantiene folder operativo IPark intacto. Simple en ambos lados.
- Contra: requiere que InvoiceOne confirme soporte de sub-carpetas por Serie en el Conector, o que IPark corra un script auxiliar que mueva archivos.

### Preguntas específicas a resolver con Americo + equipo dev

- [ ] **¿Qué opción prefieren?** A (endpoint absorbe todo), B (SFTP compartido), o C (sub-carpeta dedicada)
- [ ] Si B o C: ¿pueden otorgar acceso SFTP a Centinelia? ¿Qué credenciales usarían? ¿Autenticación por password o llave SSH?
- [ ] Si B: ¿Nala puede filtrar por prefijo `FEcen_` o quieren un mecanismo más estricto?
- [ ] Si C: ¿InvoiceOne les ha dicho si el Conector soporta ruteo de output por Serie, o necesitarían un script auxiliar?
- [ ] En cualquier opción: ¿cuál les resulta más rápido de implementar de su lado?
- [ ] ¿Tienen política de seguridad que descarte alguna de las opciones de antemano?

### Recomendación Centinelia (si piden opinión)

Preferimos **Opción C** si viabilidad de sub-carpeta por Serie está confirmada. Si no, **Opción B** con acuerdo explícito de prefijo. **Opción A** sigue siendo válida si políticas de IPark no permiten dar acceso filesystem.

### Impacto en resto del checklist

Las secciones 1 "Contrato técnico del endpoint" y 3 "Idempotencia" cambian radicalmente según la opción elegida. Las secciones 2 "Serie y folios", 4 "Correo de pruebas", 5 "Ambiente de pruebas", 6 "Operación y soporte", 7 "Multi-RFC emisor", 8 "Datos del concepto fiscal" aplican igual en las 3.

---

## 1. Contrato técnico del endpoint

- [ ] URL base del endpoint sandbox
- [ ] URL base del endpoint producción
- [ ] Esquema JSON del request (qué campos espera, nombres, tipos, cuáles obligatorios). Llevamos propuesta inicial en `08-endpoint-json-propuesta.md`.
- [ ] Esquema JSON del response (qué devuelve en éxito, qué en error)
- [ ] Método de autenticación (bearer token, API key en header, mTLS, otro) y cómo nos entregan la credencial
- [ ] **Modelo de espera:** Como el Conector no tiene webhook, el endpoint IPark debe hacer file-watch interno de `/salida/`. ¿Endpoint síncrono (bloquea hasta ver XML+PDF o `.error.txt`, con timeout razonable), o asíncrono con 202 + `poll_url`?
- [ ] Si síncrono: timeout máximo esperado (sugerencia: 30-60s basado en latencia típica del Conector)
- [ ] Si asíncrono: cada cuánto polear el `poll_url` y qué devuelve mientras procesa
- [ ] Tabla de códigos de error con significado (ej. 400 RFC inválido, 409 duplicado, 503 conector caído, 502 `.error.txt` del Conector)
- [ ] Cómo traduce el endpoint los `.error.txt` del Conector a HTTP responses (parsear motivo del .error.txt y mapear a error_code semántico)
- [ ] Rate limits (requests por minuto, por hora)
- [ ] Timeouts esperados del lado de ellos

## 2. Nomenclatura de Serie y folios

InvoiceOne confirmó: Serie y folio deben venir en el TXT fuente, el Conector NO los administra. Hay que decidir en la reunión quién lleva el contador.

- [ ] Aceptan Serie `CEN` o prefieren otra convención (sugerencias alternativas: `AI`, `BOT`, `AUT`, `NAL`, o sufijo)
- [ ] **Quién lleva el contador de folios:** opción A IPark lo administra en el server del endpoint (recomendado, un solo contador para toda la Serie), opción B Centinelia lo mantiene y lo manda en el request
- [ ] Si lo administran ellos, regresan el folio asignado en el response (ya resuelto, siempre regresan UUID y pueden regresar folio también)
- [ ] Rango inicial reservado para Serie CEN (sugerencia: `00000001` a `00099999`)

## 3. Idempotencia

- [ ] El endpoint deduplica requests por su cuenta o Centinelia debe mandar un `Idempotency-Key` en header
- [ ] Si Centinelia manda el header, cuánto tiempo lo honran (24h, 7 días)
- [ ] Si llega request duplicado, devuelven el UUID original o un 409
- *Nota interna: ya tenemos el hash determinístico listo en `tests/lib/invoicing/c1-idempotency-design.test.ts`, podemos pasarlo como header.*

## 4. Correo de pruebas de IPark

- [ ] Pedir alias de IPark no en uso (ej. `pruebas@ipark.com.mx`) con reenvío automático a `ipark-demo@centinelia.mx`
- [ ] Aclarar que es para probar la extracción de Nala con correos reales de clientes, NO el ambiente InvoiceOne
- [ ] Si no tienen uno libre, pueden crear uno temporal

## 5. Ambiente de pruebas

InvoiceOne confirmó: ambiente de pruebas YA activo en los 2 servers IPark. 400 timbres gratis por solicitud, extensibles.

- [ ] Confirmar con Americo que ya tiene identificado cuál de los dos servers es el que usarán para pruebas de este proyecto
- [ ] En qué carpetas específicas del Conector van a montar `/entrada/`, `/procesados/` y `/salida/` para esta integración (si usan los defaults o rutas dedicadas Centinelia)
- [ ] Cuándo estima su equipo que el endpoint HTTPS esté listo para primeras pruebas (el Conector ya está, solo falta el wrapper endpoint que ellos van a construir)
- [ ] Confirmar que están dentro de los 400 timbres gratis o si ya consumieron parte

## 6. Operación y soporte

- [ ] Contacto técnico directo (nombre, correo, WhatsApp) del dev de IPark asignado para dudas durante integración
- [ ] Canal de comunicación para incidencias en producción (correo, Slack, WhatsApp)
- [ ] Horario de soporte técnico IPark
- [ ] Procedimiento si el conector o endpoint se cae: Nala hace fallback a cola interna y reintenta, o escala a humano directo

## 7. Multi-RFC emisor y datos del Emisor en el request

El TXT layout C1 requiere EMISOR con `RFC`, `Nombre` y `RegimenFiscal` (secciones mínimas de la 5 del PDF `LC1-CFDI40`). Decisión abierta: quién llena esos campos.

- [ ] IPark opera varias razones sociales. El endpoint acepta un parámetro `rfc_emisor` en el request, o es endpoint distinto por RFC, o es API key distinta por RFC
- [ ] **Recomendación propuesta: una API key por RFC emisor**, el endpoint deriva automáticamente RFC + Nombre + RegimenFiscal + LugarExpedicion de ahí. Centinelia nunca manda datos del emisor. Simplifica el JSON y evita que Centinelia tenga que mantener un catálogo de RFCs de IPark.
- [ ] Nala necesita saber el RFC emisor correcto por sucursal o boleto, o el endpoint lo deduce del folio
- [ ] En el request Centinelia solo manda `folio_boleto` + datos del receptor + total. ¿Les cuadra ese contrato mínimo?

## 8. Datos del concepto fiscal y cálculo

Según el PDF, cada concepto necesita Cantidad × ValorUnitario = Importe exacto, más clave SAT (90111500 estacionamiento), clave unidad (E48 servicio), ObjetoImp (02 sí objeto).

- [ ] **IPark ya tiene definidos esos códigos SAT (90111500, E48, 02) en sus facturaciones manuales,** o quieren usar otros. Confirmar que los que trae el PDF son los que operativamente usan.
- [ ] **¿Quién calcula ValorUnitario?** El TXT exige `Cantidad × ValorUnitario = Importe` exacto. Si IPark tiene tarifa fija por sucursal, su endpoint lo deriva del folio del boleto. Si la tarifa varía por hora, descuentos por N días, etc., hay que decidir fuente de verdad. **Mi fixture #1 asume 258.62/día, puede no ser real.**
- [ ] La descripción del concepto la arma IPark con base en el folio, o la manda Centinelia pre-armada. Mi default actual: Centinelia arma algo tipo "Servicio de estacionamiento IPark MTY, 3 dias (del YYYY-MM-DD al YYYY-MM-DD), boleto XXXX".
- [ ] Qué pasa si el total que manda Centinelia difiere del total que IPark tiene registrado para ese folio: rechaza, loguea, o usa el de IPark (gana el sistema de boletos)
- [ ] **UsoCFDI default:** G03 para corporate. ¿IPark tiene casos donde usan G01 (honorarios), D01 (deducciones personales) u otro? Reglas específicas por tipo de cliente, si existen
- [ ] **Franja fronteriza:** el PDF usa IVA 16%. ¿IPark opera o planea abrir en Tijuana, Juárez, u otra ciudad de frontera norte donde la tasa sería 8%? Hoy MTY no aplica, pero conviene preguntar antes de hardcodear.

## 8bis. Reglas operativas que salen del layout PDF

Temas específicos de operación que surgieron al leer los ejemplos oficiales del PDF `LC1-CFDI40` y validar los fixtures edge:

- [ ] **Multi-concepto en una factura (fixture #13).** El Ejemplo III del PDF muestra 2 conceptos en 1 TXT. Mi default es N TXTs separados cuando llegan múltiples boletos en el mismo correo. ¿Preferencia operativa de IPark? Un corporate con 5 boletos del mes, ¿quiere 5 PDFs o 1 PDF con 5 conceptos?
- [ ] **Notas de crédito (fixture #12).** Requiere TipoDocumento `E` + secciones `CFDI_RELACION|1|04|` y `CFDI_RELACIONADO|1|<UUID_original>|`. ¿El endpoint de IPark puede buscar el UUID original dado un folio_boleto en su sistema, o Centinelia debe guardarlo cada vez que timbra y mandarlo en el request del Egreso?
- [ ] **Observaciones field del CFDI.** Mi TXT ejemplo incluye `"Boleto 2087341 estancia IPark MTY 03-06 sept 2026"` para trazabilidad humana. ¿Les cuadra esa convención o quieren otra?
- [ ] **AddendaIO.** El PDF menciona que los campos de domicilio del emisor y receptor solo se incluyen si IPark activa la opción Addendas en configuración de la empresa. ¿Está activa en el ambiente que usarán? Relevante si quieren domicilios completos en el XML.

## 9. Compromisos de timeline

- [ ] Fecha estimada de endpoint sandbox listo
- [ ] Fecha estimada de primera prueba E2E
- [ ] Fecha target de arranque productivo (POC 30 días)

---

## Lo que Centinelia ofrece entregar en la misma llamada

Para que el equipo de dev de IPark pueda arrancar sin esperar más intercambios:

- [ ] Lista de los campos exactos que Nala extrae del correo (los del `CfdiInput` + metadatos)
- [ ] Ejemplo de JSON request completo con un caso real (fixture #1 Grupo Mex). Ver `08-endpoint-json-propuesta.md`.
- [ ] **Ejemplo del TXT layout C1 ya armado para fixture #1 (lo que su endpoint debe producir).** Ver `09-txt-layout-c1-ejemplo-fixture1.md`. Incluye breakdown por sección y catálogos SAT usados.
- [ ] Documento resumido con los 4 casos edge que vale la pena contemplar: público en general, extranjero, pre-pago, duplicado. Ver `02-fixtures-correos.md` fixtures #11, #15, #16.
- [ ] Confirmación del hash de idempotencia como `Idempotency-Key` header (si lo aceptan)

## Preguntas que se dejan fuera del scope de la primera llamada

Para follow-up por correo, no sobrecargar:

- Volumen esperado por hora o día en producción (negociable después del POC)
- SLA del endpoint IPark (99.9%, 99.5%)
- Logging y auditoría del lado de IPark
- Cómo manejan versioning del contrato (v1, v2, breaking changes)

---

## Notas de contexto para abrir la llamada

1. Confirmar primero que entendimos bien la propuesta de Americo: IPark expone endpoint, Centinelia postea JSON, IPark maneja TXT y Conector C1 internamente. Sí/no.
2. Si confirma: avanzamos con este checklist.
3. Si corrige: ajustar al modelo que realmente propone.
4. Agradecer la propuesta: para nosotros simplifica integración y para ellos acota superficie expuesta.
5. Compartir lo que ya nos confirmó InvoiceOne por correo (sección "Insumos resueltos antes de la reunión" arriba) para evitar que su equipo pierda tiempo en preguntas ya cerradas.

## Pendiente no respondido del WhatsApp del viernes

Americo contestó la parte de nomenclatura y mencionó el endpoint, pero NO respondió sobre el alias de correo de pruebas. Punto #4 del checklist es exactamente eso.
