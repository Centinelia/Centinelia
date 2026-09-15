# Navi — Submission de Meta App Review

**Fecha:** 2026-09-14
**Owner:** Nazre
**Duración estimada:** 2-4 semanas (Meta App Review) + 1 día setup inicial

## Objetivo

Registrar la Meta App "Centinelia Social" en `developers.facebook.com` con los permisos que Navi necesita para publicar en Instagram, moderar comentarios y DMs, y leer métricas.

## Pre-requisitos

- Cuenta Facebook admin con acceso a `developers.facebook.com`
- Cliente kickstart (agencia) tiene Facebook Business Manager configurado
- Al menos una IG Business o Creator cuenta del cliente, linkeada a una FB Page
- Política de privacidad publicada en `centinelia.mx/privacidad` (con sección Meta actualizada — ver `docs/legal/privacy-policy.md`)
- Terms of service accesibles vía URL pública

## Paso 1: Crear la Meta App

1. Ir a https://developers.facebook.com/apps/
2. Click "Create App"
3. Seleccionar tipo: **Business**
4. Display name: `Centinelia Social`
5. App contact email: `nazre20@gmail.com`
6. Business Account: seleccionar el Business Manager de Centinelia (crearlo si no existe)
7. Confirmar creación

## Paso 2: Configurar Basic Settings

En `App Settings → Basic`:

| Campo | Valor |
|-------|-------|
| Display Name | Centinelia Social |
| App Domains | `centinelia.mx` |
| Privacy Policy URL | `https://centinelia.mx/privacidad` |
| Terms of Service URL | `https://centinelia.mx/terminos` |
| Data Deletion Instructions URL | `https://centinelia.mx/api/social/data-deletion` |
| Category | Business and Pages |
| App Icon | Logo Centinelia 1024x1024 (transparent PNG, morado #6C3BFF) |

Guardar cambios.

## Paso 3: Agregar productos

En `Products +`, agregar:

1. **Facebook Login for Business** (para OAuth)
2. **Instagram Graph API** (para publicar + métricas + comentarios)
3. **Messenger Platform** (para DMs de Instagram)

## Paso 4: Configurar OAuth Redirect URIs

En `Facebook Login for Business → Settings`:

Valid OAuth Redirect URIs (uno por línea):

```
https://www.centinelia.mx/api/auth/meta-callback
https://centinelia-product-git-feat-navi-social-media-centinelia.vercel.app/api/auth/meta-callback
http://localhost:3000/api/auth/meta-callback
```

Nota: agregar el URL del preview de Vercel específico del branch `feat/navi-social-media` una vez el primer deploy exista. Puede requerir wildcard: si Meta lo permite, usar `https://centinelia-product-git-*.vercel.app/api/auth/meta-callback` — si no, agregar el URL exacto del preview.

## Paso 5: Copiar credenciales a Vercel

En `App Settings → Basic`, copiar:

- **App ID** → Vercel env var `META_APP_ID`
- **App Secret** (click Show) → Vercel env var `META_APP_SECRET`

Aplicar en los 3 environments: Production, Preview, Development.

## Paso 6: Configurar Business Verification

En `Business Manager → Business Info`:

1. Verificar el negocio (Business Verification) — sube documentos oficiales de Centinelia (RFC, comprobante de domicilio comercial).
2. Meta puede pedir un video call de verificación (agendar cuando aparezca).
3. Sin Business Verification, Meta App Review NO puede aprobar permisos avanzados.

**Este paso puede tomar 1-3 semanas si no está hecho ya.**

## Paso 7: Agregar cliente kickstart como Tester

En `App Roles → Roles`:

1. Add People → Tester
2. Email del contacto del cliente kickstart (usar el que Nazre tenga en el pipeline actual)
3. Cliente recibe email + notificación en Facebook
4. Cliente acepta la invitación desde su cuenta Facebook personal
5. Una vez aceptado, sus cuentas IG Business linkeadas a sus FB Pages son accesibles en modo Development

Repetir por cada cuenta IG que se quiera testear antes de aprobación pública. Máximo ~25 testers por app.

## Paso 8: Solicitar permisos en App Review

En `App Review → Permissions and Features`, solicitar UNO POR UNO:

| Permiso | Justificación (usar verbatim) | Screencast necesario |
|---------|-------------------------------|---------------------|
| `instagram_content_publish` | "Centinelia Social permite a agencias de marketing publicar posts, reels y stories en las cuentas de Instagram de sus clientes desde un dashboard centralizado. Sin este permiso, la funcionalidad principal del producto no existe." | Sí — mostrar flow: cliente aprueba draft → app publica → post aparece en IG |
| `instagram_manage_comments` | "El servicio responde a comentarios positivos con templates pre-aprobados por el cliente, y escala comentarios negativos/de crisis al equipo humano del cliente." | Sí — mostrar flow: comentario llega → app lo clasifica → responde o escala |
| `instagram_manage_insights` | "Genera reportes semanales de rendimiento (impresiones, alcance, engagement) para que el cliente tome decisiones sobre su contenido." | Sí — mostrar flow: dashboard de métricas del cliente |
| `instagram_manage_messages` | "El servicio responde a DMs de baja fricción (horarios, ubicación, precios) con templates aprobados por el cliente, y escala DMs complejos al equipo humano." | Sí — mostrar flow: DM llega → app clasifica → responde template o escala |
| `pages_show_list` | "Necesario para que el cliente seleccione qué Facebook Page (y por ende qué IG Business) quiere conectar durante OAuth." | No |
| `pages_read_engagement` | "Necesario para leer los comentarios en las publicaciones de las páginas gestionadas." | No |
| `pages_manage_metadata` | "Necesario para leer el estado de las páginas (activas, verificadas) durante OAuth." | No |
| `business_management` | "Necesario para operar dentro del contexto de Business Manager del cliente cuando la cuenta IG está bajo un Business." | No |

Para cada uno de los 4 permisos que requieren screencast:

### Formato del screencast

- Duración: 3-5 minutos
- Grabar con OBS o Loom en 1080p
- Audio: voz en off explicando cada paso (en inglés — Meta prefiere inglés aunque acepta otros idiomas)
- Estructura:
  1. Login del cliente al portal `/portal/[token]/oficina/redes/[naviId]`
  2. Mostrar la Meta App conectada (OAuth completado previamente)
  3. Ejecutar el flow completo relevante al permiso (publicar reel, responder comment, ver métricas, responder DM)
  4. Mostrar el resultado en Instagram real
  5. Cerrar mencionando el valor para el usuario final

### Herramientas para el screencast

- OBS Studio: gratis, cross-platform
- Loom: freemium, más fácil pero limita 5 min free
- Descript: paga pero excelente para audio en off

## Paso 9: Someter App Review

En `App Review → Requests`:

1. Click "Start Submission"
2. Por cada permiso, agregar screencast + justificación (copiar-pegar de la tabla)
3. Verificar que Business Verification esté ✓ Complete
4. Verificar que la política de privacidad accesible en la URL registrada
5. Submit

Meta responde en 5-15 días laborables. Si rechaza, corrige el feedback específico y vuelve a submitear.

## Paso 10: Data Deletion endpoint

Meta requiere un endpoint público donde usuarios pueden solicitar borrado de sus datos:

**URL:** `https://centinelia.mx/api/social/data-deletion`

**Comportamiento requerido:**
- Recibe POST con `signed_request` de Meta (X-Hub-Signature verificable)
- Retorna JSON `{ url: "https://centinelia.mx/data-deletion-status/<code>", confirmation_code: "<code>" }`
- Al recibir el request, encolar borrado de todo dato del user_id de Meta: `social_accounts`, `content_drafts`, `social_interactions` (todos los rows con external_from de ese user)
- Página `/data-deletion-status/<code>` muestra estado del borrado (pending / in_progress / completed)

Este endpoint lo implementa Task 10 (o antes si Meta lo pide en review). Documentar aquí como pendiente.

## Timeline realista

| Semana | Actividad |
|--------|-----------|
| 1 | Nazre crea Meta App, configura basic settings, agrega productos, configura OAuth URIs. Business Verification submit. |
| 2-3 | Business Verification aprobada (o iteración). Cliente kickstart agregado como Tester. Nazre + equipo prepara screencasts (necesita worktree con Task 4-8 al menos parcialmente listo para tener UI que grabar). |
| 3 | Someter App Review con 8 permisos + 4 screencasts + justificaciones. |
| 4-5 | Meta responde. Iterar si aplica. |
| 6+ | Meta aprueba → App pasa a modo Live → cualquier cliente puede conectar. |

## Notas

- Si Meta rechaza duro citando política de contenido, revisar `docs/legal/privacy-policy.md` sección Meta/Canva.
- Guardar el email de contacto de Meta App Review para futuras consultas.
- El App ID + App Secret son sensibles — nunca commitear al repo, solo Vercel env vars.
- Long-lived tokens de Meta duran 60 días. El cron `refresh-meta-tokens` (Task 11) los rota automáticamente el día 55.
