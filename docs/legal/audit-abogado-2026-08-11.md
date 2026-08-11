# Revisión legal — Centinelia pre-contrato Municipio (2026-08-11)

> **Contexto:** Audit exhaustivo técnico completo (62 fixes shipped en 6 sesiones). Estos son los 10 items que quedan y **requieren tu revisión legal** antes de publicar. Cada item tiene: qué falta, por qué importa, y texto sugerido en español para acelerar tu revisión.
>
> **Prioridad:** Municipio de Monterrey es cliente gobierno → LGTAIP + LFPDPPP + PCI + LFTR se aplican todos.

---

## 🔴 CRÍTICO 1 — Publicar Política de Uso Aceptable (AUP)

**Estado:** En el registro Step 4 el checkbox obliga aceptar `#aup` pero **el ancla no existe** en `/legal`. Legalmente, cliente acepta política que no está publicada = consentimiento inválido.

**Ubicación código:** `src/app/legal/page.tsx` — añadir sección con anchor `#aup`.

**Texto sugerido (revisar):**

```
## 6. Política de Uso Aceptable {#aup}

El uso del servicio Centinelia está prohibido para:

- Actividades ilegales conforme a la legislación mexicana (fraude, suplantación,
  extorsión, ingeniería social).
- Prospección masiva sin consentimiento del destinatario (violación de LFPC art. 17 BIS).
- Contacto reiterado a personas inscritas en la Lista Nacional de Consumidores
  con Llamadas (LNCL).
- Envío de información falsa o engañosa mediante los agentes.
- Discriminación basada en raza, género, religión, orientación sexual, edad o discapacidad.
- Acceso no autorizado a sistemas de terceros (SSRF, inyección SQL, escaneo de puertos).
- Uso de datos de menores de edad sin consentimiento parental documentado.
- Violación de derechos de autor o propiedad intelectual.
- Suplantación de identidad de una autoridad pública.
- Simulación de urgencia médica/emergencia no real.

Centinelia se reserva el derecho de suspender el servicio sin previo aviso si detecta
incumplimiento. El Cliente es responsable de cualquier acción legal derivada del uso
inadecuado de la plataforma por sus empleados o sub-usuarios.
```

**Preguntas para el abogado:**
1. ¿Debemos añadir cláusula específica sobre "no discriminación" para clientes gobierno (art. 1 constitucional)?
2. ¿La suspensión sin previo aviso es defendible bajo contrato de adhesión?
3. ¿Falta alguna categoría estándar de AUP mexicano?

---

## 🔴 CRÍTICO 2 — Reconciliar retention: 90 días vs 12 meses

**Estado:** Contradicción entre dos páginas:
- `/legal` sección 4 dice: "grabaciones se conservan **hasta 12 meses**"
- `/privacidad-datos` (versión plain-language) dice: "grabaciones **90 días** por defecto"

Auditor INAI marca esto como inadecuada gobernanza de datos.

**Necesita decisión de negocio:**
- ¿Cuál es la política real? 90 días para reducir storage cost, o 12 meses para valor de análisis histórico?
- ¿Aplican excepciones para Municipio (contrato específico con retention distinta)?

**Sugerencia:** Adoptar **12 meses default** con opt-out configurable per-cliente (portal setting "reducir a 90 días para menos storage cost"). Documentar la excepción de audit trail 7 años en ledger + admin_access_log.

**Ubicación código:** `src/app/legal/page.tsx` sección 4 + `src/app/privacidad-datos/page.tsx`.

---

## 🔴 CRÍTICO 3 — Página pública de sub-procesadores

**Estado:** Aviso menciona sub-procesadores inline pero no hay página dedicada con tabla actualizable + status DPA.

**Ubicación código:** Crear `src/app/sub-procesadores/page.tsx`.

**Estructura sugerida (revisar):**

| Proveedor | País | Función | Datos compartidos | DPA firmado | Contacto |
|-----------|------|---------|-------------------|-------------|----------|
| Supabase Inc. | 🇺🇸 US (AWS us-east-1) | Base de datos + storage | Datos del pool, ledger, ai_ops_log | ⏳ Pendiente | dpa@supabase.io |
| Vercel Inc. | 🇺🇸 US | Hosting Next.js + serverless | Requests, logs | ⏳ Pendiente | legal@vercel.com |
| Stripe Inc. | 🇺🇸 US | Procesamiento de pagos (Centinelia NO almacena tarjetas — SAQ-A) | Emails de clientes, metadata de cobros | ⏳ Pendiente | dpa@stripe.com |
| Vapi Inc. | 🇺🇸 US | Orquestación de llamadas (audio inbound/outbound) | Grabaciones, transcripciones, metadatos | ⏳ Pendiente | privacy@vapi.ai |
| Twilio Inc. | 🇺🇸 US | Telefonía (números virtuales, SMS) | Números salientes/entrantes | ⏳ Pendiente | privacy@twilio.com |
| Anthropic PBC | 🇺🇸 US | LLM (Claude) — prompts + respuestas | Prompt content sin PII masiva | ✅ Auto vía terms | privacy@anthropic.com |
| ElevenLabs Inc. | 🇺🇸 US | Text-to-Speech | Texto que agente dice al llamante | ⏳ Pendiente | privacy@elevenlabs.io |
| Deepgram Inc. | 🇺🇸 US | Speech-to-Text | Audio para transcripción | ⏳ Pendiente | privacy@deepgram.com |
| Upstash Inc. | 🇺🇸 US | Redis rate limiting | IPs, timestamps de requests | ⏳ Pendiente | legal@upstash.com |
| Google LLC | 🌎 Global | Gmail/Calendar/Sheets integración | Emails y calendarios del cliente que autorizó | Auto vía Google Workspace admin | — |
| Microsoft Corp | 🌎 Global | Outlook/Teams integración | Emails del cliente que autorizó | Auto vía M365 admin | — |

**Nota debajo:**
> Cambios a esta lista se notifican con **30 días de anticipación** por email al portal_email. Objeciones a un nuevo sub-procesador pueden enviarse a `privacidad@centinelia.mx`.

**Preguntas para el abogado:**
1. ¿DPA con Vapi/Stripe/Anthropic es indispensable para firmar Municipio o basta con menciones en aviso?
2. ¿Hay obligación legal de listar región exacta (us-east-1)?
3. ¿El "auto vía terms" para Anthropic es defensible?

---

## 🔴 CRÍTICO 4 — Cláusula LGTAIP en contrato Municipio

**Estado:** Contract template no menciona Ley General de Transparencia. Municipio es gobierno → obligado directo.

**Ubicación código:** `src/lib/contract/template.tsx` o `docs/legal/municipio-addendum-template.md` (nuevo).

**Texto sugerido (revisar):**

```
## Cláusula X — Obligaciones de Transparencia Gubernamental (LGTAIP)

Cuando el Cliente sea una entidad gubernamental sujeta a la Ley General de
Transparencia y Acceso a la Información Pública (LGTAIP):

1. **Publicación del contrato:** El Cliente podrá publicar este contrato,
   con datos sensibles redactados (montos, credenciales, arquitectura técnica),
   en su portal de transparencia conforme a los artículos 70 fracción XXVII de
   la LGTAIP y equivalentes locales.

2. **Solicitudes ciudadanas de información:** Solicitudes de acceso a información
   pública sobre las llamadas de la Municipalidad (número, duración, temas
   agregados sin PII) son responsabilidad del Cliente. Centinelia proveerá
   reportes agregados dentro de 10 días hábiles cuando se solicite formalmente
   por escrito.

3. **Datos personales de ciudadanos:** Las grabaciones y transcripciones de
   llamadas de ciudadanos son datos personales titulados por el ciudadano
   (no por la Municipalidad). Centinelia y el Cliente actúan como
   corresponsables. Los ciudadanos pueden ejercer ARCO directamente ante
   Centinelia (privacidad@centinelia.mx) o ante el Cliente.

4. **Reserva técnica:** Centinelia conserva el derecho de reservar
   información técnica propietaria (arquitectura, prompts, modelos, código
   fuente) conforme al artículo 113 LGTAIP como información confidencial.

5. **Cooperación en auditorías:** Centinelia proveerá dentro de 5 días
   hábiles la evidencia técnica que el Órgano Interno de Control del Cliente
   requiera formalmente para cumplir con sus obligaciones de auditoría.
```

**Preguntas:**
1. ¿La reserva técnica del punto 4 es defendible contra INAI?
2. ¿Debemos mencionar corresponsabilidad ante ciudadano (título 5to LFPDPPP art. 33)?
3. ¿Falta cláusula específica sobre "Datos Abiertos" para stats agregados?

---

## 🔴 CRÍTICO 5 — Voice recording notice (verificado técnicamente OK)

**Estado:** ✅ **YA CODIFICADO** en `src/lib/vapi/sync.ts:618`. El firstMessage default incluye "su llamada puede ser grabada" con opt-out flag `skip_recording_notice`. Confirmado durante audit.

**Riesgo para abogado:** ¿La frase "su llamada puede ser grabada" (opcional, no absoluto) es suficiente bajo LFTR? Alternativa: "esta llamada será grabada".

**Recomendación técnica:** Cambiar "puede ser" → "será" si abogado lo pide (1 línea de código).

---

## 🟠 ALTA 1 — Data breach notification en aviso

**Ubicación:** `src/app/legal/page.tsx` — añadir sección 2.12.

**Texto sugerido (revisar):**

```
## 2.12 Notificación de Vulneración de Datos

En caso de vulneración que afecte datos personales bajo custodia de Centinelia:

1. Notificaremos al Cliente dentro de **72 horas** de la confirmación de la
   vulneración, indicando:
   - Naturaleza y alcance de los datos comprometidos
   - Fecha aproximada del evento
   - Medidas de contención adoptadas
   - Recomendaciones para los titulares afectados

2. Si la vulneración afecta a **100 o más titulares** o involucra **datos
   sensibles** (biométricos, salud, sexual, ideología, origen étnico),
   Centinelia notificará al INAI dentro del mismo plazo de 72 horas conforme
   al artículo 20 de LFPDPPP.

3. El Cliente es responsable de notificar a los titulares afectados
   (ciudadanos, empleados) conforme al Reglamento de LFPDPPP artículo 65.
   Centinelia proveerá plantillas de notificación en español.

4. Centinelia realizará un análisis post-incidente y compartirá el reporte
   con el Cliente dentro de 30 días naturales.
```

**Preguntas:**
1. ¿"100 titulares" es umbral suficiente o debemos notificar siempre a INAI?
2. ¿Formato específico de reporte post-incidente (PDF firmado?, JSON?)?

---

## 🟠 ALTA 2 — Right to be forgotten (procedimiento explícito)

**Ubicación:** `src/app/legal/page.tsx` sección 2.8 (expandir).

**Texto sugerido:**

```
### Procedimiento para ejercer Cancelación (Derecho al Olvido)

1. Envía correo a **privacidad@centinelia.mx** con asunto **"Solicitud
   Cancelación"** e incluye:
   - Copia de identificación oficial vigente (INE, pasaporte, cédula)
   - Especifica qué datos deseas eliminar:
     - [ ] Datos personales identificatorios (nombre, teléfono, email)
     - [ ] Grabaciones de llamadas y transcripciones
     - [ ] Historial de interacciones (facturas, tickets, aprendizajes)

2. **Confirmación**: recibirás acuse dentro de **48 horas hábiles**.

3. **Investigación**: **20 días hábiles** máximo desde acuse.

4. **Ejecución**: si procede, **15 días hábiles** adicionales.

5. **Plazo total máximo: 35 días hábiles**.

### Excepciones legales — datos NO eliminados

Ciertos datos se conservan aún después de cancelación por obligaciones legales:

- **Ledger de transacciones** (billing, minutos, tareas): 7 años (Código Fiscal
  de la Federación art. 30).
- **Registros de auditoría de acceso** (admin_access_log): 7 años (LGTAIP).
- **Documentos con datos fiscales** (CFDI, facturas): 5 años (SAT).
- **Comunicaciones sujetas a disputa activa**: hasta resolución + 6 años.

Los datos exceptuados se **anonimizan** (nombre, teléfono, email reemplazados
por hash) pero se conservan los montos y timestamps.
```

---

## 🟠 ALTA 3 — Email footer legal

**Ubicación código:** `src/lib/email/send.ts` — función `shell()` o footer.

**Texto sugerido para footer HTML:**

```
Centinelia by Pneuma Studio · Monterrey, Nuevo León
[Términos] · [Privacidad] · [Ejercer ARCO: privacidad@centinelia.mx]
Este correo fue enviado como parte del servicio contratado. No es marketing.
```

Aplica a TODOS los emails transaccionales (welcome, factura, reset, notificación de pool, etc.).

---

## 🟠 ALTA 4 — Cookie consent banner

**Estado:** No hay banner. Sitio usa cookies funcionales (session, admin) — no third-party tracking, por lo que en México (LFPDPPP) no es estrictamente obligatorio, pero es mejor práctica publicar aviso.

**Recomendación:** Banner mínimo al primer visit con:
- "Este sitio usa cookies esenciales para autenticación. No usamos cookies de publicidad ni tracking."
- Botón "Entendido" (dismiss).
- Link a `/privacidad-datos#cookies`.

**Nota:** Si integramos Google Analytics o similar más adelante, banner de opt-in obligatorio.

---

## 🟠 ALTA 5 — Política de menores de edad

**Ubicación código:** `src/app/legal/page.tsx` sección 2.4.

**Texto sugerido:**

```
### 2.4a Protección de Menores de Edad

El servicio está diseñado para uso por adultos representantes legales de un
negocio o entidad gubernamental. **No dirigimos publicidad a menores de edad.**

Cuando un menor de edad llame a un negocio operado por Centinelia (ejemplo:
municipio recibe llamada de menor para reportar problema urbano):

1. El agente digital solicita, cuando corresponde, un adulto responsable
   antes de continuar con trámites formales.
2. Si el menor proporciona datos personales espontáneamente:
   - Se capturan bajo la responsabilidad del adulto tutor si se identifica.
   - Se eliminan en **30 días** si el tutor lo solicita.
3. Para trámites que legalmente requieran datos de menores (pre-registro
   escolar, apoyos sociales):
   - Se requiere **consentimiento expreso del adulto responsable**, grabado
     en la propia llamada o en documento escrito.
   - Se retienen únicamente el tiempo necesario para el trámite.
   - El titular puede solicitar eliminación al cumplir 18 años.
```

---

## 🟠 ALTA 6 — Health data incidental

**Ubicación:** `src/app/legal/page.tsx` sección 2.4 (expandir).

**Texto sugerido:**

```
### Datos de Salud Incidentales

Si un titular proporciona espontáneamente información sobre su estado de salud
durante una llamada (ejemplo: "soy diabético y me cuesta caminar"), Centinelia:

1. NO usa esos datos para perfilar al llamante ni para decisiones automatizadas.
2. Marca la grabación/transcripción para retención mínima de **30 días** salvo
   que sea necesaria para el trámite explícito.
3. NO transfiere datos de salud a sub-procesadores adicionales sin consentimiento
   expreso del titular.
4. Permite eliminación inmediata a solicitud, sin requerir 20 días hábiles
   del proceso ARCO estándar.
```

---

## 🟢 MEDIA 1 — Divulgación cross-border explícita

**Estado:** Aviso menciona US pero no región/AWS específica.

**Texto sugerido en sección 2.6:**

```
Los datos personales se procesan y almacenan en servidores de nuestros
sub-procesadores ubicados en **Estados Unidos** (región AWS us-east-1 para
Supabase; datacenters de Vercel/Vapi/Anthropic en territorio estadounidense).

Conforme al artículo 37 fracción III de LFPDPPP, estas transferencias
internacionales se realizan porque son **necesarias para la prestación del
servicio contratado**. El titular puede revocar consentimiento en cualquier
momento contactando privacidad@centinelia.mx.

**Nota importante para clientes gobierno:** si el Cliente requiere que los
datos permanezcan en territorio nacional mexicano por normativa sectorial,
Centinelia puede negociar acuerdo específico. Contactar hola@centinelia.mx.
```

---

## Checklist de preguntas prioritarias

Antes de tu sesión con el abogado (2h estimadas):

1. ¿Cuáles de los 10 items DEBEMOS shippear antes de firmar Municipio?
2. ¿DPAs con Vapi/Stripe/Anthropic — pedir vía email o hay proceso formal?
3. ¿La retención 90 vs 12 meses la decidimos como negocio (¿cuál compramos?)?
4. ¿Necesitamos firma electrónica avanzada (e.firma SAT) para contrato Municipio o basta con signature digital simple?
5. ¿Debemos registrar Centinelia como "prestador de servicios especializados" en algún padrón para vender a gobierno?
6. ¿Riesgo de que INAI multe por consent captured antes de fix P8 (consent_log solo desde hoy)?
7. ¿Cláusula de limitación de responsabilidad razonable ante Municipio (dinero o multiplos de facturación)?
8. ¿Recomiendan alguna cobertura de seguro cyber liability?

---

## Archivos de referencia

- Aviso privacidad actual: `src/app/legal/page.tsx`
- Aviso plain: `src/app/privacidad-datos/page.tsx`
- Contract template: `src/lib/contract/template.tsx` (o buscar por "contrato")
- Voice recording notice: `src/lib/vapi/sync.ts:618` (ya OK)
- Consent log helper: `src/lib/legal/consent-log.ts` (nuevo, shipped)
- Cron retention: `src/app/api/cron/cleanup-analytics/route.ts` (nuevo, shipped)

---

## Timeline sugerido

- **Semana 1:** Reunión abogado. Aterrizar decisión sobre P1, P2, P4, P5. Encargar DPAs.
- **Semana 2:** Publicar AUP, cookie banner, política menores, email footer, data breach section, health data clause. Todo texto que se decida.
- **Semana 3:** Firmar contrato Municipio con LGTAIP clause + DPA references.
- **Continuo:** Monitorear DPAs pendientes; hookear cuando firmemos.
