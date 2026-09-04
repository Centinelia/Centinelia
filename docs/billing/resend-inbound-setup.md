# Setup Resend Inbound para pipeline Nala (BLOQUEADOR piloto Beatriz)

## Diagnóstico (2026-09-04)

- Dominio `centinelia.mx` está **verificado en Resend** para outbound (DKIM,
  SPF de `send.centinelia.mx`) pero **NO tiene Inbound configurado**.
- MX records de `centinelia.mx` apuntan a `secureserver.net` (Titan), no
  a Resend.
- Endpoint `/api/billing/inbox` está deployed y auth funciona (POST con
  secret correcto → 200, sin secret → 401), pero **nunca recibirá correo**
  hasta que se configure Resend Inbound.
- No existe camino alternativo para que Beatriz mande notitas: el flow
  espera correos entrantes vía Resend, y no hay endpoint de upload directo
  por portal ni polling IMAP para este pipeline.

## Consecuencia

El piloto Beatriz **no puede arrancar** aunque el resto del pipeline esté
al 100%. Beatriz manda foto → nada llega → Nala no genera XML → writer
no timbra → cliente no recibe CFDI.

## Solución (setup one-time, ~30 min)

### Paso 1 — Elegir subdominio para Inbound

No podemos usar `centinelia.mx` directamente porque su MX ya apunta a
Titan (donde vive `hola@centinelia.mx`). Sugerido: `billing.centinelia.mx`
o `inbox.centinelia.mx`. Nazre elige.

### Paso 2 — Configurar dominio Inbound en Resend

1. Dashboard Resend → **Inbound** (sidebar) → **Add domain**.
2. Ingresar el subdominio elegido (ej. `billing.centinelia.mx`).
3. Resend genera 1 MX record que hay que agregar al DNS.

### Paso 3 — Agregar MX record en DNS

Ir al provider DNS de `centinelia.mx` (GoDaddy, Cloudflare, etc.) y
agregar:

```
Tipo:      MX
Nombre:    billing   (o el subdominio elegido)
Valor:     <valor que dio Resend, típicamente inbound-smtp.us-east-1.amazonaws.com>
Prioridad: 10
TTL:       3600
```

Esperar propagación (5-30 min típico).

### Paso 4 — Verificar en Resend

Dashboard → Inbound → clickear "Verify". Debe pasar a estado `active`.

### Paso 5 — Configurar webhook Inbound

Dashboard → Inbound → seleccionar el dominio → **Endpoints** → **Add
endpoint**:

- **URL:** `https://www.centinelia.mx/api/billing/inbox?secret=<EMAIL_INBOUND_SECRET>`
- **Método:** POST
- **Content-Type:** multipart/form-data (Resend default)
- **Match pattern:** `*@billing.centinelia.mx` (o similar wildcard para
  aceptar cualquier alias — cada cliente tendrá su alias distinto).

### Paso 6 — Verificar E2E

Desde Nazre (regla `feedback-no-tests-a-clientes`):

```bash
# 1. Insertar organization_integrations de test para nazre20@gmail.com
UPDATE organization_integrations
SET config = jsonb_set(config, '{inbox_email}', '"smoke-test@billing.centinelia.mx"'::jsonb)
WHERE portal_email = '<test_org>' AND type = 'contpaqi';

# 2. Enviar correo desde nazre20@gmail.com a smoke-test@billing.centinelia.mx
#    con foto de notita adjunta.

# 3. Verificar en BD:
SELECT * FROM billing_incoming_emails
ORDER BY created_at DESC LIMIT 1;
```

Si aparece la fila con `attachment_count > 0`, el webhook está OK.

## Alternativas descartadas

- **Titan + polling IMAP**: requiere refactor de `nala-mailbox` para
  rutear entre Nala interna vs pipeline billing. Más código, más frágil,
  latencia mayor (poll cada 10 min).
- **SendGrid Inbound Parse**: usado por `/api/email/inbound` (bandejas de
  agentes), no por billing. Fragmentar en dos providers duplica config.
- **Upload directo por portal**: cero infra externa pero cambia UX del
  cliente (tiene que entrar al portal en vez de reenviar correo). Aceptable
  como fallback si Resend Inbound no cuaja, pero requiere UI nueva.

## Riesgo del setup

**Muy bajo.** MX de subdominio no afecta al MX raíz (`hola@centinelia.mx`
sigue en Titan). El webhook tiene auth por `?secret=`. Nada rompible.
