# Nami (inventarios) — Setup del archivo Excel nuevo para AC Proyectos

Guía operativa para preparar el archivo Excel que Nami va a trabajar en producción.
Sustituye al `INVENTARIO 2026 1.xlsx` actual (que queda como referencia read-only).

## Por qué archivo nuevo

El archivo actual acumula problemas que romperían la automatización:

- Fórmulas rotas desde fila ~4432 en la columna F (año de compra aparece como texto literal `=IF(...)`).
- Bodegas duplicadas por typo (`FLETEROS` 3448 filas vs `FLETERO` 974 filas — mismo concepto).
- Basura hasta la columna 1147 (copy-paste histórico).
- Fila con `ENTREGADO` en columna BODEGA (error de captura).

Empezar limpio evita que Nami escriba encima de datos corruptos o replique errores.

## Preparación (5-10 min)

1. En SharePoint de AC, crear archivo nuevo en la misma carpeta donde vive el actual.
   - Nombre sugerido: `INVENTARIO NAMI 2026.xlsx`.
2. Crear 3 hojas: `INVENTARIO`, `STOCK`, `BACKLOG`.
3. Aplicar los headers de las secciones siguientes, tal cual (mayúsculas, orden y ortografía).
4. En `INVENTARIO`, seleccionar el rango de headers + 1 fila vacía → **Insertar → Tabla** con "Mi tabla tiene encabezados". Renombrar la tabla a `Tabla6` (Diseño de tabla → Nombre de tabla).
5. Compartir el archivo con la cuenta de Outlook conectada a Nami (permiso de edición).
6. Copiar el ID del archivo (URL de SharePoint) para configurar `location.itemId` en el portal.

## Hoja INVENTARIO (histórico por serie)

Cada equipo TRANE recibido tiene su propia fila. Headers ordenados:

```
OC | FECHA OC | FOLIO FACTURA | FECHA FACTURA | TONELADA | MODELO | DESCRIPCION | REF | SEER | VOLTS | SERIE | ALMACEN | USD | TC | COSTO MX | ESTATUS | BODEGA | ENTREGADO | VEND | CLIENTE | FOLIO | FECHA DE VENTA | FACTURA | COSTO VTA (MX) | FACTOR
```

Notas:

- `ALMACEN` es la columna con `1` cuando el equipo llegó físicamente.
- `ENTREGADO` es la columna con `1` cuando el equipo salió del almacén al cliente.
- `COSTO MX` es fórmula `=USD*TC` (Nami lo calcula al agregar equipo si mandas ambos valores).
- `ESTATUS` es el estado lógico: ALMACEN, SEPARADO, ENTREGADO, PEDIDO, PENDIENTE, DEVUELTO, DESHABILITADO.
- `BODEGA` es FLETEROS (equipos 1-5 TR), CENIZO (>5 TR) o TRANE.
- `VEND` es el código: ANA, ANG, MTP, RLP.
- `FACTOR` = precio_venta / costo_mx (se puede llenar manual o dejar que `inv_reporte_utilidad` lo calcule agregado).

## Hoja STOCK (pivote por modelo)

Cada modelo TRANE con existencia tiene su propia fila.

```
PL | MODELO | DESCRIPCION | TONELADA | REF | SEER | VOLTS | STOCK ACTUAL | STOCK BODEGA 1 | STOCK BODEGA 2 | STOCK CLIENTE | IDEAL | NUEVO PEDIDO | PROPUESTA PARA PEDIR
```

- `PL` = precio de lista (referencia interna, opcional).
- `STOCK ACTUAL` = fórmula `=COUNTIFS(INVENTARIO[MODELO], A2, INVENTARIO[ESTATUS], "ALMACEN")` (ajustar rango).
- `IDEAL` = cantidad objetivo por modelo. Cuando `STOCK ACTUAL < IDEAL`, Nami sugiere reposición.

## Hoja BACKLOG (pipeline TRANE)

Copy-paste del reporte que Isabel de TRANE manda periódicamente por correo.

```
OC AC | OC TRANE | FECHA REGISTRO | MODELO | CANTIDAD | ESTATUS TRANE | FECHA ENTREGA ESTIMADA | NOTAS
```

- Header start_row = 5 en el config (para respetar el layout del reporte original de TRANE).

## Configuración en el portal

Una vez creado el archivo, en el portal:

1. Ir a `/portal/[token]/integraciones/inventario`.
2. Pegar el `siteId`, `driveId` y `itemId` del archivo (extraídos de la URL de SharePoint o via /me/drive lookup).
3. Definir headers si difieren de los defaults documentados aquí.
4. Agregar correos de encargados de reposición (los que reciben el correo cuando stock < ideal).
5. Guardar y probar con "Probar conexión".

## Acceso read-only al archivo viejo

Nami también recibe permiso de lectura al `INVENTARIO 2026 1.xlsx` original para poder consultar histórico cuando ventas pregunte por un equipo entregado hace meses. El archivo viejo no se toca — Nami solo lee.

Configurar el itemId del archivo viejo en `inventory_excel_config.legacy_readonly.itemId` (opcional, aún no cableado en tools; enum futuro cuando se implemente `inv_consultar_historico_viejo`).

## Ver también

- `src/lib/inventory/adapter.ts` — schema de `InventoryExcelConfig` (JSONB en `organizations.inventory_excel_config`).
- `src/lib/inventory/graph-excel.ts` — wrapper Microsoft Graph Excel API.
- `.brain/skills/adding-a-meerkat-tool.md` — checklist para tools nuevas.
- `[[handoff-ac-proyectos-inventarios]]` — contexto piloto AC.
