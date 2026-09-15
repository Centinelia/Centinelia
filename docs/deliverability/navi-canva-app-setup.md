# Navi — Setup de Canva Connect App

**Fecha:** 2026-09-14
**Owner:** Nazre
**Duración estimada:** 1 hora (sin App Review requerida por Canva)

## Objetivo

Registrar una integración Canva Connect en `www.canva.com/developers` para que Navi pueda hacer autofill de brand templates, exportar diseños y subir assets. Canva no requiere un proceso de review formal como Meta — solo registro de la integración.

## Pre-requisitos

- Cuenta Canva (Pro o superior recomendado — Free tier funciona pero limita templates)
- Cliente kickstart tiene cuenta Canva con brand templates listas (o Nazre le ayuda a crearlas como servicio profesional aparte)

## Paso 1: Crear integración en Canva Connect

1. Ir a https://www.canva.com/developers/
2. Click "Create an integration"
3. Integration name: `Centinelia Social`
4. Integration type: **Private** (interno, no publicable en marketplace de Canva por ahora)
5. Description: "Empleado digital Navi de Centinelia. Publica contenido en Instagram desde brand templates de Canva."

## Paso 2: Configurar OAuth

En `Configuration → Authorization`:

**Redirect URIs (uno por línea):**

```
https://www.centinelia.mx/api/auth/canva-callback
https://centinelia-product-git-feat-navi-social-media-centinelia.vercel.app/api/auth/canva-callback
http://localhost:3000/api/auth/canva-callback
```

**Scopes** (marcar los 7):

- `design:content:read` — leer diseños existentes
- `design:content:write` — crear diseños via autofill
- `asset:read` — leer assets subidos
- `asset:write` — subir imágenes/videos como assets
- `brandtemplate:content:read` — leer contenido de brand templates
- `brandtemplate:meta:read` — leer metadata de brand templates (nombre, categoría, campos)
- `profile:read` — leer info del usuario Canva conectado

## Paso 3: Copiar credenciales a Vercel

En `Configuration → Credentials`:

- **Client ID** → Vercel env var `CANVA_CLIENT_ID`
- **Client Secret** (click Reveal) → Vercel env var `CANVA_CLIENT_SECRET`

Aplicar en los 3 environments: Production, Preview, Development.

## Paso 4: Verificar rate limits

Canva Connect API rate limits (2026):
- 500 requests/min por integration
- Autofill jobs: async, cuenta como 1 request al crear + 1 por poll
- Export jobs: async, cuenta como 1 request al crear + 1 por poll

Para un cliente Navi Agencia con 10 cuentas gestionadas (~600 tareas/mes), el consumo esperado es ~30-50 requests/min en peaks — dentro del límite. Nazre no necesita subir tier.

## Paso 5: Brand templates del cliente kickstart

El cliente (agencia) debe:

1. Crear los brand templates dentro de su cuenta Canva
2. En cada template, marcar los campos que Navi debe rellenar via autofill:
   - Text: titulo_post, precio, telefono, promo, etc.
   - Image: producto, logo_cliente, background
3. Guardar cada template como "Brand template" (no diseño normal)

**Guía para el cliente:** https://www.canva.dev/docs/connect/api-reference/brand-templates/

Si el cliente no sabe cómo hacer templates con data fields, Centinelia puede ofrecer el servicio como paquete profesional aparte (~$3K MXN one-time por 10 templates listas). No incluido en el kickstart.

## Paso 6: Verificar la integración funciona

Una vez las credenciales estén en Vercel y el cliente conecte su Canva vía OAuth (Task 5 del plan):

- El endpoint `/api/portal/[token]/social/templates/sync` debe listar los brand templates del cliente
- El endpoint `/api/voice/tools/canva-generar-diseno` debe crear un design vía autofill
- El endpoint `/api/voice/tools/canva-exportar` debe exportar a PNG/MP4

Los tests unitarios del `CanvaProvider` (Task 2) validan el shape de las llamadas, no la integración real. Task 15 valida E2E con Canva del cliente kickstart.

## Timeline

| Día | Actividad |
|-----|-----------|
| 1 | Nazre crea integration, configura scopes + redirect URIs, copia credenciales a Vercel |
| 1 | Cliente conecta su Canva vía OAuth desde el portal |
| Semana 2 | Cliente carga brand templates (con o sin ayuda de Centinelia) |
| Semana 6 (E2E) | Navi ejecuta autofill + export + publica en IG desde template real |

## Notas

- Canva no cobra por el API standard. Free tier de Canva permite integraciones.
- Client Secret es sensible — nunca commitear.
- Access tokens de Canva duran ~4 horas. Refresh tokens duran ~30 días. `CanvaProvider.refreshToken` (Task 2) los rota automáticamente cuando falta <30 min para expirar.
- Si Canva rota su API o deprecia scopes, revisar https://www.canva.dev/docs/connect/ y actualizar.
