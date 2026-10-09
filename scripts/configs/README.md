# Configs CFDI 4.0 para timbrado via Facturama

Configs JSON listos para timbrar con el CLI `scripts/facturama-emitir-ingreso.ts`. Cada archivo es un `CfdiInput` del tipo `src/lib/invoicing/provider.ts` serializado. `pacCredentials` y `csd` quedan en blanco porque el CLI auto-llena desde env (`FACTURAMA_USER`, `FACTURAMA_PASSWORD`) y Facturama tiene los CSDs server-side bajo la cuenta del RFC emisor.

## AC Proyectos — paquete de implementación $80,000 + IVA (4 mensualidades de $23,200)

Ciclo decidido 2026-10-09: todas las mensualidades 2/4 en adelante caen el **día 1 del mes natural** (ver `.brain/decisions/2026-10-09-facturacion-dia-1-del-mes-standard.md`). ClaveProdServ `81111500` (Programación de sistemas computacionales), reemplaza al `81111812` que se usó en la 1/4.

Contactos:
- **Facturación → Tania**: `tania@acproyectos.com`
- **Operaciones → Camila**: `camila@acproyectos.com` (NO mandar factura aquí)

### Calendario

| Factura | Config | Fecha de timbrado | Status |
|---|---|---|---|
| 1/4 | timbrada manual | 2026-09-28 | ✅ UUID `55a93750-5b23-495c-a8ba-72fcb23942d7` |
| **2/4** | `ac-proyectos-mensualidad-2.cfdi.json` | **al depósito** (meta: entre 2026-10-28 y 2026-11-01) | ⏳ ready |
| 3/4 | `ac-proyectos-mensualidad-3.cfdi.json` (crear duplicando) | 2026-12-01 | pendiente |
| 4/4 | `ac-proyectos-mensualidad-4.cfdi.json` (crear duplicando) | 2027-01-01 | pendiente |

### Flujo mensual (día 25-28 → día 1)

1. **Día 25-28** del mes anterior: recordatorio a Tania por correo con monto `$23,200` y referencia bancaria.
2. **Al depósito** confirmado (ideal entre día 28 y día 1): timbrar PUE forma 03 con el comando de abajo.
3. **Día 1-5**: factura en manos de Tania (via `--email=tania@acproyectos.com`).

### Comandos

⚠️ **Importante**: los comandos corren desde `C:/Users/Nazre/centinelia/` (repo principal, donde vive `.env.local`), NO desde el worktree. El flag `--out=<path>` requiere el `=` (sin espacio).

Verificado el 2026-10-09 contra sandbox Facturama: UUID devuelto, XML/PDF/QR generados, clave `81111500` aceptada, totales correctos.

**Dry-run en sandbox** (recomendado antes de la primera corrida):

```powershell
cd C:/Users/Nazre/centinelia
npx tsx scripts/facturama-emitir-ingreso.ts `
  --config=.claude/worktrees/nami-fase1-inventory-writers/scripts/configs/ac-proyectos-mensualidad-2.cfdi.json `
  --sandbox `
  --out=./out-facturama/ac-mensualidad-2-sandbox
```

Verifica en el output: UUID devuelto, XML descargado, totales cuadran ($23,200), concepto correcto, RFC receptor `AAP010601S21`. Si todo OK, procede a prod.

**Prod + enviar a Tania**:

```powershell
cd C:/Users/Nazre/centinelia
npx tsx scripts/facturama-emitir-ingreso.ts `
  --config=.claude/worktrees/nami-fase1-inventory-writers/scripts/configs/ac-proyectos-mensualidad-2.cfdi.json `
  --prod `
  --email=tania@acproyectos.com `
  --out="C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Facturación/Factura_2026-10_Centinelia_a_ACProyectos_Nami-Mensualidad2-de-4"
```

El PDF y XML quedan guardados directo en el Dropbox del cliente, con el mismo patrón de carpeta que la 1/4.

**Prod sin correo** (si prefieres revisar el PDF antes de mandar):

```powershell
cd C:/Users/Nazre/centinelia
npx tsx scripts/facturama-emitir-ingreso.ts `
  --config=.claude/worktrees/nami-fase1-inventory-writers/scripts/configs/ac-proyectos-mensualidad-2.cfdi.json `
  --prod `
  --out="C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Facturación/Factura_2026-10_Centinelia_a_ACProyectos_Nami-Mensualidad2-de-4"
```

Luego revisas el PDF y lo mandas tú a Tania adjuntando el XML.

### Para crear 3/4 y 4/4

```powershell
# 3/4 — diciembre
Copy-Item scripts/configs/ac-proyectos-mensualidad-2.cfdi.json scripts/configs/ac-proyectos-mensualidad-3.cfdi.json
# editar: descripcion → "Mensualidad 3 de 4 - periodo noviembre 2026 ..."

# 4/4 — enero (último mes de implementación: QA + entrega)
Copy-Item scripts/configs/ac-proyectos-mensualidad-2.cfdi.json scripts/configs/ac-proyectos-mensualidad-4.cfdi.json
# editar: descripcion → "Mensualidad 4 de 4 - periodo diciembre 2026 - QA y entrega. Servicios de consultoría e implementación - Proyectos Nami y Naia ..."
```

### Después de Mes 4: operación recurrente

A partir del 2027-01-01, Nami arranca en media jornada tareas starter. Clave `81112200` (Mantenimiento y soporte de software) en vez de `81111500`. Config: crear `ac-proyectos-operacion-mensual.cfdi.json` cuando se defina el monto exacto del plan.

## Env vars requeridas

En `C:/Users/Nazre/centinelia/.env.local`:

```
FACTURAMA_USER=...
FACTURAMA_PASSWORD=...
RESEND_API_KEY=...   # solo si se usa --email
```
