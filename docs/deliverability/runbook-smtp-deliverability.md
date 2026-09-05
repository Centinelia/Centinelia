# Runbook de entregabilidad de correo SMTP

**Uso**: cuando un cliente reporta "el correo de mi empleado (Nelia/Nia/etc.) no está llegando", este runbook cubre las 3 causas más probables y qué hacer con cada una.

**Contexto técnico**: los empleados que envían por SMTP salen desde el buzón real del cliente (ej. `servicioalcliente@dominio.com`). Para que Gmail/Outlook/iCloud NO los marquen como spam ni los descarten, el dominio del cliente necesita 3 registros DNS: SPF, DKIM, DMARC. Sin los 3, la entregabilidad es una lotería que dura mientras dure la reputación del relay.

---

## Diagnóstico rápido (5 min)

1. Abrir `/admin/soporte` y buscar el incidente reportado.
2. Correr esta query en Supabase SQL editor (reemplaza `PORTAL_EMAIL`):
   ```sql
   SELECT created_at, to_email, provider, ok, error, smtp_response
   FROM outbound_emails
   WHERE portal_email = 'PORTAL_EMAIL'
     AND created_at >= NOW() - INTERVAL '7 days'
   ORDER BY created_at DESC;
   ```
3. Interpretar:
   - `ok=false` → el envío falló en nuestro lado. Ver `error` y `smtp_response`.
   - `provider=resend` en filas que antes eran `outlook` → SMTP del cliente empezó a fallar y cae al fallback. Investigar creds o cambios recientes en el servidor de correo del cliente.
   - `ok=true` en TODAS pero destinatario dice no recibir → el problema es de entregabilidad del destinatario final. Continuar con este runbook.

---

## Causa 1: iCloud es especial (frecuente)

**Síntoma**: al principio llegaban bien, de repente ya no. Nunca rebota, simplemente no llega o va a spam / "Correo no deseado".

Apple tira a spam sin rebotar cuando la reputación del sender baja. Ocurre incluso con correos legítimos si:
- El dominio no tiene DKIM alineado
- Se enviaron muchos correos al mismo destinatario iCloud en poco tiempo
- El content de los correos tiene keywords que iCloud considera bulk (mucho HTML tabular, muchas imágenes)

**Qué pedirle al usuario iCloud**:
1. Abrir Mail.app o iCloud.com/mail
2. Ir a la carpeta **Correo no deseado (Junk)**
3. Buscar correos de `servicioalcliente@dominio-del-cliente.com` (el sender del empleado)
4. Con cualquier correo del empleado abierto: **Mensaje → Marcar como no basura**
5. Agregar al remitente a **Contactos** (botón "+" al lado del nombre en el header del correo)
6. **Configuración → Reglas** → confirmar que no hay filtro que mande esos correos a alguna carpeta

**Después de esto**, los siguientes correos deberían empezar a caer a inbox otra vez. Si no pasa en 24h, es DKIM/DMARC (causa 3).

---

## Causa 2: Filtros de Outlook/Exchange (menos frecuente)

**Síntoma**: los correos no aparecen en inbox pero tampoco en spam del cliente Outlook365.

Outlook365 tiene 3 lugares donde puede quedar atrapado un correo:
1. **Junk Email** (spam)
2. **Focused Inbox** vs **Other** (por defecto solo se ve "Focused")
3. **Reglas de bandeja** que el usuario o su admin haya definido

**Qué pedirle al usuario Outlook365**:
1. En Outlook: click en pestaña **Otros** (arriba del inbox, al lado de "Prioritarios"). Si el correo está ahí, moverlo a "Prioritarios" y decir "Mover siempre".
2. Buscar en **Correo no deseado**.
3. Revisar **Configuración → Ver toda la configuración de Outlook → Correo → Reglas** y **Correo no deseado → Remitentes bloqueados**.
4. Si es cuenta empresarial (Exchange), pedir al admin del tenant que revise:
   - Cuarentena a nivel de organización (Microsoft 365 Defender → Email & collaboration → Review → Quarantine)
   - Reglas de transporte que puedan estar filtrando por dominio del sender

---

## Causa 3: Falta DKIM + DMARC del dominio del cliente (root cause más común)

**Síntoma**: dos o más destinatarios en diferentes proveedores (uno Gmail, uno iCloud, etc.) reportan no recibir. Los correos salen (`ok=true` en `outbound_emails`) pero no llegan.

Sin DKIM y sin DMARC, el correo pasa/no-pasa en base a la **reputación del relay SMTP** del cliente. Los relays de proveedores mexicanos genéricos (Telmex/CarrierZone, Titan, hosting compartido de cPanel) tienen reputación mediocre porque comparten IP con miles de otros clientes, algunos spammy. Los grandes receptores (Gmail, iCloud, Outlook365) van bajando la reputación con el tiempo.

**Fix**: publicar DKIM + DMARC en el DNS del dominio del cliente. Esto autoriza formalmente al relay del cliente a firmar correos en su nombre.

---

### Guía paso a paso para el dueño del dominio

Esta parte se la mandas a Beatriz/Victor. Ellos (o su técnico de confianza) tienen que hacerlo.

#### Paso 1: Verificar SPF (probablemente ya lo tienen)

```
Comando (cualquier terminal):
  nslookup -type=TXT tu-dominio.com.mx

Debe mostrar algo como:
  "v=spf1 a mx include:spfc75.carrierzone.com ~all"
```

Si no aparece: piden a su proveedor de correo (Telmex/carrierzone/cPanel/etc.) que les diga qué SPF poner y lo publican en su panel DNS.

#### Paso 2: Obtener la clave DKIM del proveedor de correo

Depende del proveedor:

| Proveedor | Cómo pedir la DKIM |
|---|---|
| **Telmex Prodigy / CarrierZone** | Abrir ticket al soporte técnico: "Necesito habilitar DKIM signing para mi dominio X y publicar el registro DNS. Envíenme por favor la clave pública y el selector (ej. `default._domainkey`)." |
| **cPanel** (hosting compartido) | Entrar al cPanel → sección **Email** → **Email Deliverability**. Ahí se ve el estado de DKIM y muestra el TXT que hay que publicar. |
| **Google Workspace** | Admin Console → Apps → Google Workspace → Gmail → Autenticar correo. Genera clave y da el TXT. |
| **Microsoft 365** | Microsoft 365 Defender → Email & collaboration → Policies → DKIM → activar para el dominio. Publicar los CNAMEs que da. |

**Salida esperada**: te dan un registro DNS tipo:
```
Tipo:  TXT (o CNAME según proveedor)
Nombre: default._domainkey  (o similar; el selector varía)
Valor: v=DKIM1; k=rsa; p=MIGfMA0G...  (una key larga base64)
```

#### Paso 3: Publicar el DKIM en tu DNS

1. Entra al panel de tu registrador (dónde compraste el dominio: Akky, GoDaddy, NIC.mx, etc.)
2. Busca la sección **DNS / Zone Editor / Registros DNS**
3. Agrega un nuevo registro **TXT** (o CNAME si es lo que te dieron) con el Nombre y Valor exactos que te dio el proveedor de correo
4. Guarda. Los cambios tardan de 10 min a 2 horas en propagarse.

Verificar que funcionó:
```
nslookup -type=TXT default._domainkey.tu-dominio.com.mx

Debe devolver la key que publicaste.
```

#### Paso 4: Publicar DMARC en modo seguro (p=none)

DMARC le dice a los receptores qué hacer cuando SPF y DKIM no coinciden. **NUNCA empezar en `p=reject`** — se rompe todo. Se empieza en `p=none` (solo monitoreo) por 2 semanas para ver reportes, y luego se escala.

Agregar este registro TXT en tu DNS:

```
Tipo:  TXT
Nombre: _dmarc
Valor: v=DMARC1; p=none; rua=mailto:CORREO-QUE-REVISES@tu-dominio.com.mx; adkim=r; aspf=r
```

Reemplazar `CORREO-QUE-REVISES@` por un correo real donde puedas revisar los reportes (los mandan las plataformas cada semana).

Verificar:
```
nslookup -type=TXT _dmarc.tu-dominio.com.mx
```

#### Paso 5 (después de 2 semanas): escalar DMARC

Cuando los reportes muestren que ~95%+ de los correos legítimos pasan DMARC, actualizar el registro a:
```
v=DMARC1; p=quarantine; rua=mailto:CORREO@tu-dominio.com.mx; adkim=r; aspf=r; pct=25
```
Empieza con `pct=25` (aplica la política solo al 25% de los correos que no pasan). Después de 1 semana sin quejas, subir a 50, 75, 100.

Finalmente, subir a `p=reject` cuando todo esté estable. Este es el nivel de protección máximo.

---

## Checklist interno para Centinelia (centinelia.mx)

Antes de mandar el runbook a un cliente, verificar que nuestro propio dominio tiene todo:

```bash
nslookup -type=TXT centinelia.mx           # debe mostrar SPF con include:_spf.resend.com
nslookup -type=TXT resend._domainkey.centinelia.mx   # debe mostrar la DKIM key de Resend
nslookup -type=TXT _dmarc.centinelia.mx    # debe mostrar DMARC
```

**Estado 2026-09-05**: falta el DKIM de Resend + falta actualizar SPF para incluir Resend + falta DMARC. Los correos fallback (`notificaciones@centinelia.mx`) están llegando por reputación de Resend, no por autenticación formal. Fix pendiente — requiere:
1. Panel DNS de GoDaddy (o donde esté registrado centinelia.mx)
2. Dashboard de Resend → añadir dominio verificado, copiar los DNS records que da
3. Publicarlos en el DNS

---

## Contactos útiles

- **Soporte CarrierZone/Telmex**: 800 8000 (correo empresarial soporte técnico)
- **Docs Resend DKIM**: https://resend.com/docs/dashboard/domains/introduction
- **Verificador público SPF/DKIM/DMARC**: https://mxtoolbox.com/dmarc.aspx

---

## Historial de este runbook

- **2026-09-05**: creado a raíz de Tortillería Estrella (Nelia). Ramón (iCloud) empezó recibiendo bien y dejó de recibir; supervision@ recibe correctamente. Root cause probable: iCloud bajando reputación del relay + falta de DKIM/DMARC del dominio.
