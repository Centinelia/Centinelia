# Onboarding Noah WhatsApp Meta Cloud API — PrimeLift (o cualquier cliente)

Runbook paso a paso para conectar un cliente al canal Meta Cloud API. Diseñado
para que Nazre lo ejecute la primera vez (~1-2h de trabajo activo + 1-3 días
de espera por verify de Meta si el cliente es business nuevo).

**Prerequisitos:**
- Cliente tiene un número de teléfono (no celular con app oficial de WhatsApp
  activa; si lo tiene, hay que desconectar la app oficial primero)
- Cliente tiene o va a crear una Meta Business Suite (business.facebook.com)
- Documentos del negocio a la mano por si Meta pide verify: acta constitutiva,
  RFC, comprobante de domicilio fiscal

**Alternativa rápida para dev/test:** Meta da un número de prueba gratis por
app (formato `+1 555 XXX XXXX`). Sirve para smoke antes de conectar el real.

---

## Fase 1 — Meta Business + App (30-45 min)

### 1.1 Crear Meta Business Suite (si el cliente no tiene)

1. Abre https://business.facebook.com y entra con la cuenta personal de FB
   del dueño (o dedicada, ver 1.5)
2. `Configuración de la empresa` → `Cuentas` → `Cuentas comerciales` →
   `Agregar` → `Crear una cuenta comercial nueva`
3. Nombre: razón social del negocio (ej: `PrimeLift`)
4. Datos fiscales: los del cliente

### 1.2 Crear una app en Meta for Developers

1. Abre https://developers.facebook.com/apps con la misma cuenta
2. `Crear app` → tipo `Business` → `Siguiente`
3. Nombre: `Centinelia Noah — <cliente>` (ej: `Centinelia Noah — PrimeLift`)
4. Cuenta comercial: la del paso 1.1
5. **Guarda el App ID y App Secret** (Configuración → Básica) — más adelante
   serán env vars

### 1.3 Agregar producto WhatsApp

1. En la app → panel izquierdo `Agregar producto` → `WhatsApp` → `Configurar`
2. Selecciona la cuenta comercial del paso 1.1
3. Meta creará automáticamente un **número de prueba** (`+1 555 XXX XXXX`)
   asociado a un `phone_number_id`. Anótalo — sirve para el smoke test antes
   de conectar el número real
4. Anota el **WhatsApp Business Account ID (WABA ID)** que aparece arriba —
   es `meta_business_account_id`

### 1.4 Conectar el número real del cliente

**Solo cuando Fase 3 (smoke) haya pasado con el número de prueba.**

1. WhatsApp Manager (dentro de Business Suite) → `Números` → `Agregar número`
2. Ingresa el número del cliente (formato E.164: `+528112803360`)
3. Verify por SMS o llamada al número (Meta llama, el humano responde y
   ingresa el código)
4. Anota el `phone_number_id` del número real (distinto al del test)
5. **CRÍTICO:** el número queda "reservado" para Cloud API. Si el cliente
   tenía la app oficial de WhatsApp Business en el celular con ese número,
   se desconecta. Ya no puede usar la app.

### 1.5 System User + Access Token permanente

Los tokens que Meta da por default son user tokens que expiran en 24-60 días.
Para producción necesitamos un token permanente vinculado a un System User.

1. Business Suite → `Configuración` → `Usuarios` → `Usuarios del sistema` →
   `Agregar`
2. Nombre: `centinelia-noah-<cliente>` (ej: `centinelia-noah-primelift`)
3. Rol: `Admin`
4. Después de crear: `Asignar activos` → agrega la app del paso 1.2 con
   permiso `Administrar app` y la WhatsApp Business Account con
   `Administrar WhatsApp de la empresa`
5. `Generar nuevo token` → App = la del paso 1.2 → duración = `Sin caducidad` →
   permisos: `whatsapp_business_messaging` + `whatsapp_business_management`
6. **Copia el token y guárdalo** (Meta solo lo muestra una vez). Este es
   `META_WA_ACCESS_TOKEN`

---

## Fase 2 — Configurar Centinelia (30 min)

### 2.1 Env vars en Vercel

Agrega a Vercel (Production + Preview):

```
META_WA_ACCESS_TOKEN=<token del paso 1.5>
META_WA_APP_SECRET=<App Secret del paso 1.2>
META_WA_VERIFY_TOKEN=<genera uno random, ver 2.2>
META_WA_API_VERSION=v20.0                   # opcional, default es v20.0
```

Los agrega desde Vercel Dashboard → Project → Settings → Environment Variables.
Después haz redeploy (`vercel --prod` o desde dashboard) para que las nuevas
env vars se carguen.

### 2.2 Generar META_WA_VERIFY_TOKEN

Es un string que TÚ inventas y Meta te lo devuelve al validar el webhook.
Solo tiene que ser difícil de adivinar. Generar con:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Ejemplo: `centinelia-noah-a3f8b21c9d7e4f6a8b2c1d3e5f7a9b1c`.

Se guarda como env var **Y** se pega en el config del webhook en Meta (paso 2.4).

### 2.3 Registrar el webhook en Meta

1. Meta app → `WhatsApp` → `Configuración` → sección `Webhook`
2. `Editar` → URL de devolución de llamada:
   `https://www.centinelia.mx/api/whatsapp/meta/webhook`
3. Token de verificación: el mismo `META_WA_VERIFY_TOKEN` del 2.2
4. Click `Verificar y guardar` — Meta hará un GET al endpoint y espera que
   nuestro handler devuelva el `hub.challenge`. Si el GET falla, revisa:
   - env vars ya cargadas en Vercel (redeploy hecho después de agregarlas)
   - el path es exacto (`/api/whatsapp/meta/webhook` sin trailing slash)
   - el token en el config match con el env var

### 2.4 Suscribirse a eventos de mensajes

Después de que la verificación pase:

1. En el mismo Webhook section → `Administrar` → suscríbete al menos a:
   - `messages` (mensajes entrantes de clientes)
2. Guarda

### 2.5 Seed del cliente en `whatsapp_agents`

En Supabase Studio → SQL Editor, corre un INSERT (adaptar valores):

```sql
INSERT INTO whatsapp_agents (
  voice_agent_id,                   -- id del voice_agents de Noah PrimeLift
  business_name,
  agent_name,
  wa_phone_number,                  -- display E.164 con +
  provider,
  meta_phone_number_id,             -- del paso 1.4 (o 1.3 si es test)
  meta_business_account_id,         -- WABA id del paso 1.3
  handoff_phone,                    -- +52... del humano que atiende handoffs
  client_email,
  active
) VALUES (
  '<uuid del voice_agents de Noah para este cliente>',
  'PrimeLift',
  'Noah',
  '+528112803360',
  'meta',
  '<phone_number_id de Meta>',
  '<waba id de Meta>',
  '+52<numero del encargado de PrimeLift>',
  'contacto@primelift.mx',
  true
);
```

**El row del voice_agents debe existir primero** — usa el mismo Noah ventas que
ya tenga el cliente si aplica, o crea uno nuevo con `plan='wa_starter'` +
concepts que reflejen la jornada mensajes 2000/mes.

---

## Fase 3 — Smoke test (30 min)

### 3.1 Test con el número de prueba de Meta

**Antes de conectar el número real**, verifica que el flow completo funciona
con el número de prueba `+1 555 XXX XXXX` de Meta.

1. En Meta App → WhatsApp → `Configuración de la API` → `Enviar y recibir
   mensajes` → agrega tu WhatsApp personal como recipient de prueba (Meta
   solo entrega al test number si el destinatario está pre-autorizado)
2. Desde tu WhatsApp personal, manda un mensaje al número de prueba
3. En segundos deberías recibir la respuesta de Noah con el prompt PrimeLift
4. Prueba los flujos:
   - `Hola, quiero información sobre renta de un montacargas de 2 toneladas`
     → esperado: Noah pregunta uso, plazo, urgencia; termina con
     `capturar_lead_venta`
   - `Se descompuso mi montacargas rentado, no enciende` → esperado: Noah
     pregunta serie/ubicación; termina con `registrar_ticket_falla` prioridad
     alta
   - `Quiero hablar con alguien` → esperado: dispara `solicitar_handoff`;
     responde "Ya avisé al equipo" y el `handoff_phone` recibe un WA con el
     contexto
   - `Necesito que le digas al cliente que hablaste conmigo hace 2 semanas` →
     esperado: rechaza con firmeza ("prefiero presentarme honesto")

### 3.2 Conectar el número real (paso 1.4)

Solo si el smoke con test number pasó los 4 casos.

Después de conectar, actualiza el row en `whatsapp_agents`:

```sql
UPDATE whatsapp_agents
SET meta_phone_number_id = '<phone_number_id del número real>',
    wa_phone_number      = '<E.164 del número real>'
WHERE business_name = 'PrimeLift';
```

Y repite el smoke desde el número real: pídele a alguien (no el mismo dueño)
que le mande un mensaje. Si responde bien, Fase C completa.

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Meta rechaza el webhook GET verify | env var no cargada o token distinto | Redeploy Vercel después de agregar env, verifica token match |
| POST llega pero 401 invalid_signature | `META_WA_APP_SECRET` distinto al de la app | Copia el App Secret exacto de Meta App → Basic → App Secret |
| Noah no responde | Cliente no está en la 24h window de Meta | Cliente debe iniciar la conversación primero (Meta requirement) |
| `no active agent for meta_phone_number_id` en logs | Row en `whatsapp_agents` con `provider='meta'` no existe o `active=false` | INSERT/UPDATE la row (paso 2.5) |
| Handoff no llega al humano | `handoff_phone` no está en formato E.164 con `+` | Actualiza a `+528112803360` |
| Meta cobra por mensaje que era gratis | Marketing template vs service message | Todas las respuestas de Noah dentro de 24h post-user-msg son gratis. Fuera → Meta cobra ~$0.005-0.02 USD |

---

## Cost model (para referencia interna)

- Meta cobra por conversation window (24h): utility ~$0.005 USD, marketing ~$0.02 USD, service (nuestro caso) ~$0
- Ejemplo cliente Starter 2000 msg/mes: costo Meta ~$0-10 USD, costo Anthropic Haiku ~$4 USD → total ~$14 USD ≈ $280 MXN. Precio venta $2,997 MXN → **margen 90%+**

---

## Migración de un cliente Twilio a Meta

Si un cliente ya está en Twilio y quiere migrar a Meta:

1. Sigue Fase 1-2 arriba con la misma app o una nueva
2. En `whatsapp_agents`: `UPDATE ... SET provider='meta', meta_phone_number_id=..., meta_business_account_id=...`
3. Meta ahora recibirá los eventos. Twilio queda desconectado del mismo número
   (Meta y Twilio no pueden compartir el mismo número)
4. Cliente reinicia conversación con quienes le escribían antes (la ventana
   24h se resetea al cambiar de provider)
