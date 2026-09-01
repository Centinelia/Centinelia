-- migrations/20260827_inventory_excel_config.sql
--
-- Pack inventory_excel (Nami). Configura la ubicación del archivo Excel
-- del cliente en SharePoint/OneDrive + el mapeo de columnas + listas
-- canónicas. Activa el pack automáticamente (packs.ts::activeCheck lo lee
-- via has_inventory_excel = !!inventory_excel_config).
--
-- Schema del JSONB:
--   {
--     "location": {
--       "scope": { "type": "site", "siteId": "...", "driveId": "..." }
--         | { "type": "user", "userId": "..." }
--         | { "type": "me" },
--       "itemId": "01ABC..."   -- driveItem id del .xlsx
--     },
--     "sheets": {
--       "historico": { "name": "INVENTARIO", "table": "Tabla6" },
--       "stock":     { "name": "STOCK", "header_row": 1, "modelo_column": "H",
--                      "stock_column": "J", "ideal_column": "T",
--                      "propuesta_column": "W" },
--       "backlog":   { "name": "BACKLOG", "start_row": 5 }
--     },
--     "columns_historico": {
--       "oc": "OC", "modelo": "MODELO", "serie": "SERIE",
--       "estatus": "ESTATUS", "bodega": "BODEGA",
--       "vendedor": "VEND", "cliente": "CLIENTE",
--       "folio_venta": "FOLIO", "fecha_venta": "FECHA DE VENTA",
--       "factura_venta": "FACTURA", "costo_venta_mx": "COSTO VTA (MX)"
--     },
--     "estatus_validos": ["ALMACEN", "SEPARADO", "ENTREGADO",
--                         "PENDIENTE", "PEDIDO", "DEVUELTO", "DESHABILITADO"],
--     "bodegas_canonicas": ["FLETEROS", "CENIZO", "PORTEO", "TRANE"],
--     "bodegas_aliases": { "FLETERO": "FLETEROS" },
--     "encargados_reposicion": ["angeles@acproyectos.com"]
--   }
--
-- La estructura permite que cada org mapee sus propios headers/hojas — el
-- pack es producto de plataforma, no custom AC.

alter table organizations
  add column if not exists inventory_excel_config jsonb;

comment on column organizations.inventory_excel_config is
  'Config Nami: ubicación del Excel (SharePoint/OneDrive), mapeo de columnas y catálogos canónicos. Null = pack inactivo. Ver src/lib/inventory/adapter.ts::InventoryExcelConfig.';
