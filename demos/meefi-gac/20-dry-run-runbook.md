# Dry run runbook — Meefi + GAC pre-cita 15-sept

Este es el runbook que tú (Nazre) corres en 60-90 min este fin de semana para probar los 6 escenarios en vivo antes de la cita. Cada bloque tiene: (a) qué escribir/marcar, (b) qué debería responder el meerkat, (c) criterio pass/fail, (d) si falla, qué anotar para calibrar antes del 15.

**Regla dura del dry run**: si un escenario falla, NO lo arregles en el momento — anota el gap con detalle y sigue con el siguiente. La calibración se hace en batch después, con todos los gaps identificados. Detenerse a arreglar cada uno pierde el ángulo sistémico y quema tiempo.

**Momento óptimo para correrlo**: sábado 6-sept o domingo 7-sept en la mañana (max concentración, cero interrupciones). 60 min si todo pasa; hasta 90 min si hay que anotar gaps.

## Antes de arrancar (10 min)

### Setup ambiente

- [ ] Silenciar Nash para evitar alertas falsas de nuestros propios tests:
  ```sql
  UPDATE organizations SET pilot_notify_email = NULL
  WHERE portal_email IN ('meefi-demo@centinelia.mx','gac-demo@centinelia.mx');
  ```
- [ ] Confirmar `demo_paused = FALSE` en ambas orgs.
- [ ] Verificar en Vapi dashboard que el número `+52 33 2101 4544` (phoneNumberId `8490124b-0be7-43ce-8ea0-9543cab4ba13`) apunta a Nara Meefi con voice `9Godp7dNohUvXk6qp0gS`.
- [ ] Abrir 3 tabs Chrome:
  1. `https://www.centinelia.mx/portal/5RP13tnLK6XX` (Meefi)
  2. `https://www.centinelia.mx/portal/PJ9EALpprDEP` (GAC)
  3. Gmail (con búsqueda `to:nazre20+` lista para ver correos de chase que lleguen)
- [ ] Tener a la mano el ZIP `kyb-bajio.zip` (si aún no lo has creado, hazlo antes del dry run — es prereq de M3).
- [ ] Verificar si Sheets están cargados en `sheets_mappings`. Si NO, marcar escenarios que dependen de Sheets (M2 parte B, G3) como "skip" y anotar como bloqueador principal.

### Doc para anotar gaps

Abrir un doc nuevo `dry-run-gaps-2026-09-06.md` con esta plantilla:

```
## Escenario X
- Pass / Fail parcial / Fail total
- Qué esperaba: ...
- Qué respondió el meerkat: ...
- Gap identificado: (KB genérico / falta contexto de Meefi/GAC / tool no invocada / tool falló / voz rara / etc.)
- Prioridad fix: alta / media / baja
```

Un bloque por cada uno de los 8 subescenarios que corras.

---

## Escenario M1 · Voz — Nara Meefi consulta status wire (8 min)

### Preparación

Ninguna. Solo tu celular y el número `+52 33 2101 4544`.

### Ejecución

1. Marca al `+52 33 2101 4544` con altavoz activado.
2. Cuando Nara conteste, di textualmente:
   > "Hola, soy Rogelio Salinas de Grupo Textiles del Norte. ¿Me pueden confirmar si ya salió el wire de 85 mil dólares que ordené ayer para el proveedor en Mumbai?"

### Qué debería pasar

Nara debe:
- Saludar de vuelta usando tu nombre o al menos un saludo profesional.
- Reconocer o preguntar por Grupo Textiles del Norte (si el directorio de Meefi tiene ese cliente cargado). Si NO lo tiene cargado, debe tomarlo como onboarding sin quebrarse.
- Invocar alguna tool de consulta de status (buscar_directorio, consultar_operacion, o similar). Puedes ver esto después en la bitácora.
- Responder con **algo de este vocabulario**: MT103, referencia, ETA, banco corresponsal, hora de emisión.
- Ofrecer mandarte comprobante por correo.
- Registrar ticket o similar (opcional).
- Despedirse limpio.

### Criterio pass/fail

- **PASS** si Nara habla vocabulario financiero correcto (MT103, referencia, ETA), reconoce o graba al cliente, y no dice tonterías inventadas.
- **FAIL PARCIAL** si Nara responde amigable pero genérica ("Déjeme revisar y le confirmo") sin invocar tools ni usar el vocabulario. Esto significa KB está en modo recepcionista generic, no en modo tesorería.
- **FAIL TOTAL** si Nara aluciná datos (cantidades distintas a $85K, beneficiarios random), o si Vapi se cae.

### Si pasa

Pregúntale una segunda cosa más específica para forzar profundidad:
> "Perfecto, y ¿me pueden confirmar si el fee del corresponsal ya está incluido en los 85 mil o me lo van a cobrar aparte?"

Ver si Nara reconoce OUR/BEN/SHA como concepto o si se queda en genérico.

---

## Escenario M2 parte A · Correo Nova pre-enviado (3 min)

### Preparación

Ninguna en el dry run (no vamos a mandar el correo hoy, es para el 15). Este bloque es **check de arte visual y estructura del correo**, no de flujo dinámico.

### Ejecución

1. Abre el asset `demos/meefi-gac/14-correo-nova-consolidado-DEMO.md`.
2. Lee de corrido como si fueras Gera abriendo el correo en la mañana.

### Criterio pass/fail

- **PASS** si al terminar de leer piensas "esto es exactamente el reporte que un CFO de fintech quiere ver todas las mañanas". Alertas específicas con context, no genérico.
- **FAIL PARCIAL** si notas que faltan datos que un finance operator esperaría (variación MoM, breakdown por rieles SWIFT vs ACH vs SPEI, tabla de fees corresponsales, etc.).
- **FAIL TOTAL** si el correo se lee como slop AI (bullets sin peso, adjetivos genéricos, sin números concretos, alertas vagas).

### Si falla parcial

Anota los 2-3 campos específicos que enriquecerías. Yo (Claude) los añado al asset antes del 15.

---

## Escenario M2 parte B · Chat Nalú ad-hoc (5 min)

### Preparación

**Prereq crítico**: Sheet con purpose `custom_cartera_master` cargado y accesible al agent_id de Nalú (o al de Nova si Nalú aún no está aprovisionada en Meefi). Sin esto, este escenario se salta.

### Ejecución

1. Portal Meefi → Oficina → chat de Nalú (o Nova si no existe Nalú todavía).
2. Escribir textualmente:
   > "Nalú, arma un consolidado solo de operaciones USD mayores a 50 mil dólares de la última semana, ordenado por cliente. Devuelve tabla + Excel."

### Qué debería pasar

Nalú debe:
- Confirmar que va (mensaje breve tipo "Voy" o "Reviso cartera").
- Invocar tool `sheets_leer` con purpose `custom_cartera_master` o similar.
- Filtrar el resultado por criterios (USD, >$50K, última semana).
- Devolver mensaje con tabla estructurada + Excel adjunto (usa `create_file` format excel).
- Todo en <30 seg.

### Criterio pass/fail

- **PASS** si devuelve tabla + Excel correcto en <30 seg.
- **FAIL PARCIAL** si tarda 30-60 seg pero devuelve algo útil. Anotar timing como riesgo.
- **FAIL PARCIAL 2** si devuelve tabla pero no Excel adjunto (fallo de `create_file`).
- **FAIL TOTAL** si Nalú dice "no encuentro cartera" (Sheet no mapeado), aluciná datos, o tarda >60 seg.

### Notas de calibración a anotar

- ¿Nalú usó vocabulario correcto ("consolidado", "cartera", "USD", "operaciones") o cambió a genérico ("reporte", "datos", "archivos")?
- ¿El Excel viene con estructura financiera esperada o con columnas genéricas?

---

## Escenario M3 · Niva KYB en 60 seg + docs faltantes (10 min)

### Preparación

**Prereq crítico**: ZIP `kyb-bajio.zip` con 5 PDFs (acta constitutiva, RFC, comprobante domicilio, opinión 32-D, poder legal) del asset `16-kyb-comercializadora-bajio-DEMO.md`.

Si no tienes el ZIP armado, saltar este escenario y anotar como blocker P1.2.

### Ejecución parte 1 — Análisis KYB

1. Portal Meefi → Oficina → chat de Niva.
2. Arrastrar el ZIP al chat.
3. Escribir:
   > "Niva, procesa el KYB de este nuevo lead. Comercializadora del Bajío SA de CV, importadora de refacciones de EEUU. Necesito recomendación en 2 min."

### Qué debería pasar parte 1

Niva debe:
- Confirmar recibido.
- Extraer datos de los 5 docs (RFC, domicilio, capital, accionistas).
- Detectar consistencia entre docs.
- Identificar los 3 accionistas: Rodrigo Torres 40%, Lucía Sánchez 25%, **Viktor Kovalenko 35% (nacionalidad rusa)**.
- Ejecutar checks simulados (OFAC, PLD, UIF).
- **Recomendar NO aprobar automáticamente** por BCF Kovalenko ruso con ≥25% de participación.
- Escalar explícitamente a compliance senior humano.

### Ejecución parte 2 — Chase de docs faltantes (dentro del mismo hilo)

Después de recibir el reporte, escribir:
> "Niva, ¿qué doc adicional necesitas para reabrir el análisis?"

Niva debe responder con 1-2 docs faltantes específicos (ej. "comprobante de domicilio con vigencia < 3 meses" o "poder legal notariado vigente").

Luego escribir:
> "Sí, manda el correo pidiendo los docs. Contacto: nazre20+bajio@gmail.com, a nombre de Rodrigo Torres."

### Qué debería pasar parte 2

Niva debe invocar tool de envío de correo (send_email o similar) al `nazre20+bajio@gmail.com` con:
- Personalizado a nombre de Rodrigo Torres.
- Lista específica de los docs faltantes.
- Deadline sugerido.
- ID del expediente Bajío para trazabilidad.

Y el correo debe llegar a tu Gmail en <45 seg.

### Criterio pass/fail

**Parte 1**:
- **PASS** si Niva escala por BCF ruso y no aprueba sola.
- **FAIL CRÍTICO** si Niva aprueba directo sin escalar. Esto rompe el pitch del demo.
- **FAIL PARCIAL** si extrae datos pero no menciona la política BCF ≥25%.

**Parte 2**:
- **PASS** si el correo llega, personalizado, con lista específica.
- **FAIL PARCIAL** si Niva ofrece pero no invoca la tool.
- **FAIL TOTAL** si no propone chase o no llega el correo.

### Notas de calibración

Si FAIL CRÍTICO en parte 1 → hay que cargar en `voice_agents.role_knowledge_base` la política específica: "Beneficiarios controladores extranjeros ≥25% de países sensibles (Rusia, Irán, Corea del Norte, Cuba, Venezuela, Siria) requieren escalación enhanced KYB. NO aprobar automáticamente."

---

## Escenario G1 · Chase mensual Nara GAC (8 min)

### Preparación

**Prereq crítico**: 
- Sheet con purpose `custom_directorio_gac` cargado con los 6 clientes del asset `17-directorio-clientes-gac-DEMO.csv`.
- 6 aliases Gmail activos (`nazre20+veronica@gmail.com`, `nazre20+jmguerra@gmail.com`, etc.) — Gmail default acepta el `+X` sin config, así que basta con que puedas ver los correos filtrando `to:nazre20+` en Gmail.

### Ejecución

1. Portal GAC → Oficina → chat de Nara GAC.
2. Escribir:
   > "Nara, dispara el chase mensual a los 6 clientes de agosto. Cada uno con lo específico que falta según sus servicios contratados. Reporta cuando termines."

### Qué debería pasar

Nara debe:
- Confirmar que va a consultar el directorio.
- Invocar tool de lectura del Sheet directorio.
- Iterar por los 6 clientes.
- Por cada uno, armar correo personalizado con la lista específica de docs faltantes según servicios contratados.
- Enviar los 6 correos (via SMTP outbound o Gmail integration).
- Reportar al chat: "6 correos enviados. Scoreboard iniciado."
- Todo en <60 seg.

Y en tu Gmail (filtro `to:nazre20+`) deben aparecer los 6 correos.

### Criterio pass/fail

- **PASS** si aparecen los 6 correos, cada uno personalizado (saludo por nombre, lista específica, deadline).
- **FAIL PARCIAL** si aparecen los 6 pero todos idénticos (mailmerge). Anotar como gap crítico — es el diferencial vs mailmerge.
- **FAIL PARCIAL 2** si aparecen solo 3-4 (SMTP flaky) o si tardan >2 min.
- **FAIL TOTAL** si no llega ninguno o Nara devuelve error de tool.

### Chase de calibración

Abrir 2-3 correos y comparar. ¿La personalización es de forma (nombre distinto) o de fondo (lista de docs faltantes distinta según servicios contratados de ese cliente)? Esto último es el punto — sin eso, es mailmerge disfrazado.

---

## Escenario G2 · Reporte traducido Niva GAC (8 min)

### Preparación

**Prereq crítico**: archivo `gac-08-balance-transportes-guerra-ago2026.csv` en Sheet con purpose `custom_balance_er` (o subirlo directo al chat).

### Ejecución

1. Portal GAC → Oficina → chat de Niva GAC.
2. Subir el CSV al chat (o dar la URL del Sheet).
3. Escribir:
   > "Niva, prepara el reporte mensual traducido de Transportes Guerra Hermanos para agosto. Ricardo ya cerró la contabilidad. Devuélvelo en PDF firmado por Miguel Guajardo."

### Qué debería pasar

Niva debe:
- Confirmar recibido.
- Leer la balanza + estado de resultados.
- Detectar variación más importante vs mes anterior (esperado: combustible +$180K por diesel + viajes extra a Nuevo Laredo).
- Generar PDF de 2 páginas:
  - Pág 1: snapshot ejecutivo con ingresos/gastos/utilidad, comparativo MoM y YoY.
  - Pág 2: insight en lenguaje de dueño ("tus utilidades bajaron 12% vs julio porque...") + pago SAT + alertas + recomendaciones + firmado por Miguel.

### Criterio pass/fail

- **PASS** si el PDF tiene los 2 componentes y el insight de página 2 está en lenguaje de dueño (no jerga contable).
- **FAIL PARCIAL** si devuelve el análisis en el chat pero no genera PDF (`create_document` no invocada).
- **FAIL PARCIAL 2** si el PDF tiene la balanza pero sin traducción a lenguaje de dueño.
- **FAIL TOTAL** si aluciná cifras o no detecta la variación de combustible.

### Notas

Este escenario es alta ambición. Si sale bien, es probablemente el momento más wow del bloque GAC.

---

## Escenario G3 · Semáforo SAT Nara GAC (6 min)

### Preparación

**Prereq crítico**: Sheet con purpose `custom_semaforo_sat` con los 6 clientes marcados deliberadamente (2 amarillos + 1 rojo + 3 verdes) según el asset `15-semaforo-sat-DEMO.csv`.

### Ejecución

1. Portal GAC → Oficina → chat de Nara GAC.
2. Escribir (simulando que es día 14):
   > "Nara, dame el semáforo de mis 6 clientes para el vencimiento del 17. Y avisa a los que aún no han depositado el importe."

### Qué debería pasar

Nara debe:
- Consultar el sheet.
- Devolver dashboard con 6 clientes clasificados 🟢/🟡/🔴.
- Anunciar que envía correos a los 2 amarillos con importe + línea de captura + fecha límite.
- Enviar los correos.
- Confirmar envíos en el chat.

Y en tu Gmail deben aparecer los 2 correos a los amarillos.

### Criterio pass/fail

- **PASS** si el dashboard tiene los estados correctos y llegan los 2 correos a los amarillos.
- **FAIL PARCIAL** si el dashboard sale bien pero no llegan los correos.
- **FAIL TOTAL** si el semáforo sale genérico (todo verde o todo rojo, sin diferenciar) — significa que el Sheet no está marcado o el KB no interpreta los estados.

---

## Post-dry-run (10 min)

### 1. Revisar bitácora

Abrir en cada portal la vista de bitácora (`/portal/[token]/oficina/bitacora` o similar). Confirmar que:
- Todas las acciones ejecutadas por los meerkats están registradas.
- Timestamps correctos.
- Se puede filtrar por meerkat y por día.

Si la bitácora está lista y presentable → **el cierre teatral del demo funciona sin build extra**.
Si no está lista → anotar como blocker P3 (cierre teatral pierde punch).

### 2. Consolidar gaps

Abrir `dry-run-gaps-2026-09-06.md` con todos los bloques anotados. Ordenar por prioridad fix:
- **Alta**: cualquier FAIL CRÍTICO o FAIL TOTAL. Bloquea el demo.
- **Media**: FAIL PARCIAL en escenario hero (M1, M3, G2).
- **Baja**: FAIL PARCIAL en escenario secundario, o issues de estilo/timing.

### 3. Reactivar Nash

```sql
UPDATE organizations SET pilot_notify_email = 'nazre20@gmail.com'
WHERE portal_email IN ('meefi-demo@centinelia.mx','gac-demo@centinelia.mx');
```

### 4. Escribirme (Claude) con el resumen

Formato ideal para retomar:
```
Dry run corrido [fecha/hora].
Escenarios pass: M1, M3-parte-1, G1, G3.
Escenarios fail: M2-B (Sheet no cargado), M3-parte-2 (Niva no invocó send_email), G2 (PDF vino sin traducción a lenguaje de dueño).
Bitácora: [ready / needs work].
Gaps consolidados en dry-run-gaps-2026-09-06.md.
```

Con eso yo (Claude) armo la calibración batch específica y volvemos a probar el domingo o lunes.

---

## Contingencias durante el dry run

- **Vapi se cae** en M1 → pivotar a chat de Nara con la misma consulta. Anotar como blocker si es reproducible.
- **Sheets no cargados** → skip los escenarios que dependen (M2-B, G1, G2, G3) y anotar como blocker P1.1.
- **Un meerkat responde "no encuentro X"** → NO ajustes en el momento. Anota qué X esperaba y sigue.
- **Un correo no llega** → esperar 60 seg antes de marcar fail. SMTP puede tardar.
- **Portal se cae completo** → parar dry run, verificar `demo_paused = false` y estatus Vercel.

## Relacionados

- `13-guion-cita-15-sept.md` — estructura estratégica
- `13a-guion-detallado-15-sept.md` — script operativo del día 15
- `11-runbook-provisioning-2026-09-03.md` — qué está aprovisionado
- `handoff_que_sigue_cierre_2026-09-03.md` en memoria — prioridades
