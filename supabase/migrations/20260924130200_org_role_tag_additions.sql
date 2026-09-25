-- Escape hatch aditivo: cliente puede agregar tags a un meerkat en su org.
-- Solo AGREGA, nunca QUITA (el core del rol es inmutable).
-- FK a organizations por portal_email TEXT (convención Centinelia).
-- Ver docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Sección 4.3.

CREATE TABLE org_role_tag_additions (
  portal_email  text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  role          text NOT NULL,
  tag_slug      text NOT NULL REFERENCES ficha_tags(slug) ON DELETE RESTRICT,
  added_at      timestamptz NOT NULL DEFAULT now(),
  added_by      text,
  PRIMARY KEY (portal_email, role, tag_slug)
);

CREATE INDEX ON org_role_tag_additions (portal_email, role);

COMMENT ON TABLE org_role_tag_additions IS 'Whitelist efectiva de un meerkat en un org = role_default_tag_whitelist(role) UNION org_role_tag_additions(portal_email, role). Solo agrega, no quita.';
