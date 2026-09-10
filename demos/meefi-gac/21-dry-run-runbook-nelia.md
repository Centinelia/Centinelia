# Dry run runbook -- Nelia soporte + Niva compliance (pre-demo 15-sept)

Runbook para correr antes de la cita con Gera. Meta: validar los 5 bloques (4 Nelia + 1 Niva) end-to-end con criterios pass/fail claros.

**Cuando correrlo**: viernes 12 de septiembre (corrida 1) y sabado 13 (corrida 2 calibrada).

**Regla dura**: si un bloque falla, anotar y seguir. No calibrar en el momento. La calibracion se hace en batch al final con todos los gaps identificados.

**Regla de corte martes 11-sept 23:00**: si el chat no esta andando end-to-end con Bloques 1+2+3 sobre fixture, el Bloque 4 (2FA recovery) se descarta y se convierte en narrativa. Es el bloque mas complejo, primero en descartarse.

---

## Pre-flight (5-10 min antes de arrancar)

Verificar todo esto antes de correr el primer bloque. Si algo falla aqui, resolver antes de continuar.

- [ ] Variable `MEEFI_NELIA_AGENT_ID` seteada en `.env.local` con valor `e17bc13d-8624-4792-89d7-eac00edad051`
- [ ] Variable `MEEFI_NELIA_AGENT_ID` seteada en Vercel dashboard (Production + Preview) con el mismo valor
- [ ] Nelia visible en portal: `centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados`
- [ ] Pool de operaciones Meefi >= 500 tareas:
  ```sql
  SELECT COALESCE(SUM(amount), 0) as saldo
  FROM ops_ledger
  WHERE portal_email = 'meefi-demo@centinelia.mx';
  ```
  Si el saldo es < 500, detener y notificar a Nazre para que haga grant manual antes de continuar.
- [ ] Gmail OAuth conectado a Nelia (para IMAP APPEND al Sent). Verificar en portal > empleados > Nelia > integraciones.
- [ ] Bandeja Gmail de Nazre abierta con filtro `to:nazre20+` activo.
- [ ] Las 4 imagenes `intercom-mock-{1,2,3,4}.png` en `public/demo/meefi/`.
- [ ] `slack-mock.png` en `public/demo/meefi/`.
- [ ] `demo.centinelia.mx/meefi` (o path equivalente) responde en preview URL o local. Verificar abriendo `?scenario=1` y viendo que el widget de Nelia aparece.
- [ ] Nash silenciado para evitar alertas falsas durante la corrida:
  ```sql
  UPDATE organizations SET pilot_notify_email = NULL WHERE portal_email = 'meefi-demo@centinelia.mx';
  ```
- [ ] `demo_paused = false` en la org Meefi.
- [ ] Abrir doc `dry-run-gaps-[fecha].md` vacio con la plantilla de gaps (ver seccion Post-flight).

---

## Bloque 1 -- Password reset (10 min)

### Pasos

1. Abrir `demo.centinelia.mx/meefi?scenario=1`. El widget Nelia debe aparecer abajo-derecha.
2. En el chat, enviar el mensaje inicial:
   > "Hola, no puedo cambiar mi contrasena. Ya intente varias veces y el link no me funciona."
3. Esperar respuesta de Nelia. Verificar que llama `meefi_lookup_user_account` con el correo que viene del contexto del scenario.
4. Nelia debe detectar `password_reset_locked=true` y explicar el motivo (`identity_verified=false`). Esperar que guie al usuario a verificar el correo de bienvenida.
5. Enviar como usuario:
   > "Ya confirme mi correo, ahora si."
6. Esperar que Nelia llame `meefi_send_password_reset_link`. Verificar en la respuesta que incluye el correo destino y la vigencia de 60 minutos.

### Expected

- 2-3 turnos totales.
- Nelia menciona el motivo real del bloqueo (`identity_verified=false`), no un error generico.
- El mensaje final incluye el correo destino del link y la vigencia de 60 minutos.
- Nelia NO escala a cuentas_docs ni manda el link sin haber guiado la verificacion.

### Criterios PASS

- (a) Nelia llama `meefi_lookup_user_account` con el correo correcto del fixture.
- (b) Explica el motivo del bloqueo en el primer turno diagnostico.
- (c) Llama `meefi_send_password_reset_link` solo despues de que el usuario confirma la verificacion.
- (d) El mensaje final incluye correo destino y vigencia 60 min.

### Criterios FAIL

- (a) Manda el link directamente sin diagnosticar primero. Esto rompe la narrativa del contraste con Intercom.
- (b) Escala a cuentas_docs sin necesidad (no aplica escalamiento en este caso).
- (c) Inventa el motivo del bloqueo (dice algo que no viene del fixture).
- (d) Pide el correo al usuario aunque el scenario ya lo inyecta como contexto.

---

## Bloque 2 -- Transferencia no reflejada (12 min)

Este es el bloque HERO. Si solo un bloque tiene que funcionar perfecto, es este.

### Pasos

1. Abrir `demo.centinelia.mx/meefi?scenario=2`.
2. En el chat, enviar el mensaje inicial:
   > "Hice una transferencia de 50 mil pesos hace como dos horas y no me aparece en mi cuenta."
3. Esperar que Nelia llame `meefi_check_transfer_status` y responda con el estado de la transferencia (fixture: `pendiente_rieles`, con ETA y explicacion del proceso).
4. Verificar que Nelia NO escala en este primer turno (sin urgencia declarada).
5. Enviar como usuario (segundo turno):
   > "Es que es urgente. Es un pago a un proveedor y tiene cierre de operaciones hoy a las 5."
6. Esperar que Nelia llame `meefi_escalate_to_human` con `topic=transferencia_urgente` y `priority=alta`.
7. Cambiar a Gmail (filtro `to:nazre20+emilio`). Medir el tiempo desde que Nelia confirma el escalamiento hasta que llega el correo. Debe ser <= 10 segundos.
8. Abrir el correo y verificar los campos del template.

### Expected

- Primer turno: Nelia explica el estado con ETA sin escalar.
- Segundo turno: Nelia escala al detectar urgencia declarada ("es urgente", "tiene cierre hoy").
- Correo llega a `nazre20+emilio@gmail.com` en <= 10 segundos.
- El HTML del correo contiene los 6 campos de metadata: nombre usuario, correo, user ID, estado cuenta, flags relevantes, y al menos 1 turno de conversacion.
- El correo tiene seccion "Hipotesis Nelia" y seccion "Proxima accion sugerida".

### Criterios PASS

- (a) Primer turno: diagnostico correcto con estado y ETA, sin escalamiento.
- (b) Segundo turno: escalamiento correcto con `topic=transferencia_urgente` al detectar urgencia.
- (c) Correo llega en <= 10 segundos en Gmail.
- (d) El cuerpo HTML del correo tiene los 6 campos de metadata + resumen de conversacion + hipotesis + proxima accion.

### Criterios FAIL

- (a) Escala en el primer turno sin que el usuario declare urgencia. Esto destruye el punto narrativo del bloque.
- (b) El correo no llega (SMTP fallido o IMAP APPEND fallido).
- (c) El correo llega pero sin contexto estructurado (solo texto plano o datos incompletos).
- (d) Nelia inventa datos de la transferencia que no estan en el fixture.

---

## Bloque 3 -- Consulta KB Help Center (7 min)

Este bloque depende de que T11 (ingesta del Help Center) este corrida. Si no esta corrida, el bloque falla en el criterio (a) y hay que anotar como bloqueador.

### Pasos

1. Abrir `demo.centinelia.mx/meefi?scenario=3`.
2. En el chat, enviar:
   > "Cuanto tiempo tarda una transferencia SPEI a otro banco?"
3. Esperar que Nelia llame `meefi_search_help_center` con alguna variante de la query ("tiempos SPEI", "SPEI otro banco", similar).
4. Verificar la respuesta: debe citar 2-3 lineas literales del articulo ingerido y dar un link a `meefi.io/help/...` (aunque sea placeholder si el Help Center real no es accesible en este ambiente).

### Expected

- Nelia llama `meefi_search_help_center` (visible en logs o en el comportamiento de la respuesta).
- La respuesta cita fragmento literal del articulo, no texto inventado.
- Hay un link presente en la respuesta (aunque sea placeholder).
- No responde de memoria ni inventa tiempos distintos a los del articulo.

### Criterios PASS

- (a) Llama `meefi_search_help_center` (si no la llama, FAIL directo independientemente del contenido).
- (b) La respuesta incluye 2-3 lineas que matchean literalmente al contenido del articulo ingerido.
- (c) Hay un link (funcional o placeholder) en la respuesta.
- (d) No inventa contenido ni da tiempos que no esten en el articulo.

### Criterios FAIL

- (a) Responde de memoria sin llamar la tool.
- (b) Inventa articulos o datos (responde con confianza pero el contenido no matchea el articulo real).
- (c) No hay link en la respuesta.
- (d) La ingesta no esta corrida (T11 pendiente) y Nelia responde que no encuentra informacion.

---

## Bloque 4 -- 2FA perdido + escalamiento inteligente (12 min)

Este es el bloque mas ambicioso. Si no esta andando end-to-end al martes 11-sept 23:00, se convierte en narrativa segun la regla de corte.

### Pasos

1. Abrir `demo.centinelia.mx/meefi?scenario=4`.
2. En el chat, enviar el mensaje inicial:
   > "Perdi el celular donde tenia el Authenticator. Ya no puedo entrar a mi cuenta."
3. Esperar que Nelia llame `meefi_initiate_2fa_recovery`. Debe retornar un `recovery_ticket_id` y el checklist de 4 evidencias.
4. Verificar que Nelia presenta las 4 evidencias en un solo mensaje, en lista clara.
5. Enviar como usuario (simulando que suben las fotos y dan el dato):
   > "Listo, subi las tres fotos. Los ultimos 4 digitos son 4872."
6. Esperar que Nelia llame `meefi_escalate_to_human` con `topic=recovery_2fa` y `priority=media`. Debe incluir en el context_summary: el recovery_ticket_id, hipotesis, las evidencias recolectadas, y la proxima accion.
7. Verificar que Nelia informa al usuario el ticket ID y el SLA de respuesta de Ashley (4 horas habiles).
8. Cambiar a Gmail. Verificar que llego correo a `nazre20+ashley@gmail.com` con los campos del template y, si hay upload real de fotos, los adjuntos.

### Expected

- Nelia pide las 4 evidencias correctas (INE frente, INE reverso, selfie con INE, ultimos 4 digitos cuenta).
- Pide todo en un solo mensaje, no en mensajes separados.
- Espera a que el usuario confirme que tiene todo antes de escalar.
- Correo a Ashley llega con contexto completo.

### Criterios PASS

- (a) Pide exactamente las 4 evidencias correctas del checklist (no mas, no menos).
- (b) Espera a recibir las evidencias antes de llamar `meefi_escalate_to_human`.
- (c) El escalamiento incluye context_summary con hypothesis + next_action + referencia a las evidencias.
- (d) Correo a `nazre20+ashley@gmail.com` llega con contexto estructurado.

### Criterios FAIL

- (a) Escala sin recolectar evidencia primero. Reproduce exactamente lo que hace Intercom hoy.
- (b) Pide menos de 4 evidencias (checklist incompleto).
- (c) El correo no llega o llega sin contexto (sin evidencias, sin hipotesis).
- (d) Nelia inventar un recovery_ticket_id en vez de llamar `meefi_initiate_2fa_recovery`.

---

## Bloque Niva -- Compliance (5 min)

Validar que el flujo compliance no esta roto por el pivote al demo de Nelia. Usar el mismo escenario KYB Bajio del runbook 20.

### Pasos

1. Abrir la bandeja de Niva en el portal `centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados` > chat de Niva.
2. Escribir:
   > "Niva, procesa el KYB de este nuevo lead. Comercializadora Bajio SA de CV, importadora de refacciones de EEUU. Necesito recomendacion rapida."
3. Si tienes el ZIP `kyb-bajio.zip`, arrastrarlo al chat. Si no, correr el caso sin documentos (Niva debe responder con los datos del fixture KB).
4. Esperar el memo estructurado.

### Expected

- Memo con datos extraidos del caso (razon social, giro, accionistas si estan disponibles).
- Checks de lista negra, PEP y analisis de coherencia.
- Recomendacion clara: aprobar / no aprobar / escalar para revision.
- Si hay flag de beneficiario controlador con criterio de revision enhanced, Niva NO aprueba sola.

### Criterios PASS

- (a) Memo estructurado con al menos 3 secciones (datos, checks, recomendacion).
- (b) No inventa datos que no esten en el fixture ni en los documentos.
- (c) Si detecta caso de revision enhanced, escala y no aprueba automaticamente.
- (d) Respuesta en <= 90 segundos.

### Criterios FAIL

- (a) Aprueba directamente sin identificar ningun flag de riesgo.
- (b) Memo sin estructura (texto plano sin secciones).
- (c) Inventa nombres de accionistas u otros datos que no estan en el fixture.
- (d) Respuesta > 2 minutos.

Para criterio de pass/fail mas detallado del caso BCF Kovalenko, ver `20-dry-run-runbook.md` seccion Escenario M3.

---

## Post-flight -- plantilla de gaps

Despues de correr todos los bloques, llenar la siguiente tabla en `dry-run-gaps-[fecha].md`:

| Bloque | Tipo de gap | Severidad | Hipotesis | Fix propuesto |
|---|---|---|---|---|
| Bloque N | Criterio que fallo | Alta / Media / Baja | Por que crees que fallo | Que hay que cambiar |

Regla de severidad:
- **Alta**: FAIL en criterio pass core (el bloque no corre o el diferencial del demo se pierde). Requiere fix antes del 15.
- **Media**: FAIL parcial en escenario hero (Bloques 2 o 4). Requiere fix si hay tiempo.
- **Baja**: FAIL parcial en escenarios secundarios o issues de timing/estilo. Anotar, calibrar si sobra tiempo.

**Regla dura**: no calibrar nada durante el dry run. Anotar y seguir. La calibracion se hace al final con todos los gaps del run.

---

## Al terminar cada corrida

1. Llenar la tabla de gaps.
2. Ordenar por severidad.
3. Reactivar Nash:
   ```sql
   UPDATE organizations SET pilot_notify_email = 'nazre20@gmail.com' WHERE portal_email = 'meefi-demo@centinelia.mx';
   ```
4. Enviar resumen a Claude con este formato:
   ```
   Corrida [numero] - [fecha/hora]
   Bloques pass: [lista]
   Bloques fail: [lista con criterio fallido]
   Gaps en tabla: dry-run-gaps-[fecha].md
   Pool Meefi al cierre: [saldo en tareas]
   ```

---

## Contingencias durante el dry run

- **Widget Nelia no aparece al abrir la URL**: verificar que `MEEFI_NELIA_AGENT_ID` esta en las env vars del ambiente. Si es local, verificar `.env.local`.
- **Nelia no llama las tools**: verificar en Supabase que las tools estan registradas en los 3 canales (voice + chat + email) para el agent_id de Nelia. Query: `SELECT tool_name, channels FROM agent_tool_registry WHERE agent_id = 'e17bc13d-8624-4792-89d7-eac00edad051'`.
- **Correo no llega en 30 segundos**: esperar 60 segundos antes de marcar fail. SMTP puede tardar. Si sigue sin llegar, verificar SMTP config en Nelia y que el alias de Gmail esta bien formado.
- **Pool se agota durante el dry run**: detener, hacer grant manual, retomar. No correr bloques con pool < 50 tareas.
- **Portal se cae**: verificar `demo_paused = false` y estado en Vercel. Si es down total, parar el dry run.
- **Nelia responde en ingles**: verificar prompt de Nelia en `voice_agents.system_prompt`. Debe tener instruccion explicita de responder en espanol.

---

## Relacionados

- `13b-guion-detallado-15-sept-nelia.md` -- script operativo de la cita (incluye fallbacks)
- `22-kb-nelia-meefi.md` -- KB operativa Nelia con flujos y reglas de decision
- `20-dry-run-runbook.md` -- runbook historico (Nalu + GAC), criterios Niva heredados de ahi
- `docs/superpowers/specs/2026-09-10-demo-meefi-nelia-soporte-design.md` -- spec completo, seccion tools
- `handoff_pivote_meefi_nelia_soporte_2026-09-10.md` -- contexto del pivote y estado de tasks
