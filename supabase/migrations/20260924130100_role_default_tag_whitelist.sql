-- Whitelist fija de tags por rol de meerkat. Roster real 15 slugs
-- confirmado en src/lib/portal/meerkat-roles.ts:MEERKAT_ROLES.
-- Ver docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Sección 4.2.

CREATE TABLE role_default_tag_whitelist (
  role      text NOT NULL,
  tag_slug  text NOT NULL REFERENCES ficha_tags(slug) ON DELETE RESTRICT,
  PRIMARY KEY (role, tag_slug)
);

-- nia: Recepcionista
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nia', 'atencion_cliente'), ('nia', 'catalogo_productos'),
  ('nia', 'politicas'),        ('nia', 'ventas'),
  ('nia', 'onboarding_clientes');

-- noah: Ventas
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('noah', 'ventas'),      ('noah', 'catalogo_productos'),
  ('noah', 'atencion_cliente'), ('noah', 'marketing');

-- nico: Cobranza
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nico', 'cobranza'),    ('nico', 'contabilidad'),
  ('nico', 'atencion_cliente'), ('nico', 'politicas');

-- nelia: Atención al cliente
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nelia', 'atencion_cliente'), ('nelia', 'politicas'),
  ('nelia', 'onboarding_clientes');

-- neo: Operaciones (helpdesk)
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('neo', 'operaciones'),  ('neo', 'soporte_tecnico'),
  ('neo', 'politicas');

-- nara: Coordinadora (gobierno)
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nara', 'operaciones'), ('nara', 'atencion_cliente'),
  ('nara', 'politicas'),   ('nara', 'legal');

-- naia: Recursos humanos
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('naia', 'rh'),          ('naia', 'politicas'),
  ('naia', 'atencion_cliente');

-- nova: Centro de coordinación (despacho)
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nova', 'operaciones'), ('nova', 'logistica'),
  ('nova', 'atencion_cliente');

-- nala: Facturista (contratable por cliente)
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nala', 'contabilidad'), ('nala', 'cobranza'),
  ('nala', 'ventas'),       ('nala', 'politicas'),
  ('nala', 'fiscal');

-- nalu: Analista de tesorería
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nalu', 'finanzas'),    ('nalu', 'contabilidad'),
  ('nalu', 'fiscal');

-- nami: Inventarios
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nami', 'catalogo_productos'), ('nami', 'operaciones'),
  ('nami', 'logistica');

-- neka: Facturista interna Centinelia
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('neka', 'contabilidad'), ('neka', 'cobranza'),
  ('neka', 'fiscal'),       ('neka', 'operaciones');

-- nox, niva, nash: coordinadores, whitelist COMPLETA (todos los 15 tags)
INSERT INTO role_default_tag_whitelist (role, tag_slug)
SELECT 'nox', slug FROM ficha_tags;

INSERT INTO role_default_tag_whitelist (role, tag_slug)
SELECT 'niva', slug FROM ficha_tags;

INSERT INTO role_default_tag_whitelist (role, tag_slug)
SELECT 'nash', slug FROM ficha_tags;

COMMENT ON TABLE role_default_tag_whitelist IS 'Whitelist fija por rol. Editable por Centinelia via migration, no por cliente. Cliente puede AGREGAR via org_role_tag_additions pero no quitar.';
