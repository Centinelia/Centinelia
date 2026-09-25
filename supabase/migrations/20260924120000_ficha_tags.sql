-- Tabla catálogo de tags de dominio para fichas informativas.
-- Enum controlado por Centinelia (no libre por cliente).
-- Ver docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Sección 4.1

CREATE TABLE ficha_tags (
  slug        text PRIMARY KEY,
  label_es    text NOT NULL,
  descripcion text,
  orden       int NOT NULL DEFAULT 0,
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ficha_tags (slug, label_es, descripcion, orden) VALUES
  ('contabilidad',        'Contabilidad',           'facturación, CFDI, conciliaciones, régimen fiscal', 10),
  ('cobranza',            'Cobranza',               'mora, recordatorios, pagos vencidos',              20),
  ('ventas',              'Ventas',                 'cotizaciones, precios, ofertas, cierres',          30),
  ('atencion_cliente',    'Atención al cliente',    'tono, quejas, respuestas frecuentes',              40),
  ('catalogo_productos',  'Catálogo de productos',  'SKUs, características, disponibilidad',            50),
  ('politicas',           'Políticas',              'descuentos, devoluciones, garantías',              60),
  ('rh',                  'Recursos humanos',       'empleados, vacaciones, nómina, incidencias',       70),
  ('operaciones',         'Operaciones',            'procesos internos, horarios, ubicaciones',         80),
  ('logistica',           'Logística',              'rutas, envíos, tiempos de entrega',                90),
  ('marketing',           'Marketing',              'campañas, promociones, brand voice',              100),
  ('finanzas',            'Finanzas',               'flujo de caja, cuentas por pagar y cobrar',       110),
  ('legal',               'Legal',                  'contratos, cláusulas, cumplimiento no fiscal',    120),
  ('fiscal',              'Fiscal',                 'régimen, CSDs, PACs, obligaciones SAT',           130),
  ('onboarding_clientes', 'Onboarding de clientes', 'proceso de alta, requisitos, welcome',            140),
  ('soporte_tecnico',     'Soporte técnico',        'fallas, tickets, troubleshooting',                150);

COMMENT ON TABLE ficha_tags IS 'Catálogo controlado por Centinelia. 15 tags cubren 95% de PyME LatAm. Nuevos tags requieren PR de producto.';
