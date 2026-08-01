# Trámites externos — operación

## Insertar un secret en el Vault

Los secrets (bearer tokens, api keys) NO van en env vars ni en la tabla
`external_secrets` directamente. Se guardan en Supabase Vault:

1. En el SQL editor de Supabase (production o el ambiente relevante):

```sql
-- 1) Insertar el secret en el Vault
SELECT vault.create_secret(
  'EL_VALOR_DEL_SECRET_AQUI',
  'mty_utiles_api_key',
  'Bearer token del API del Municipio de Monterrey para Programa Utiles 2026'
);
-- Anotar el UUID que regresa.

-- 2) Registrar la referencia en external_secrets
--    portal_email es la PK de organizations en este repo.
INSERT INTO external_secrets (portal_email, key, vault_secret_id, description, last_rotated_at)
VALUES (
  '<portal_email_de_la_org_del_municipio>',
  'mty_utiles_api_key',
  '<uuid_del_paso_1>',
  'Bearer token API Municipio MTY - Programa Utiles 2026',
  now()
);
```

2. Para rotar: llamar `SELECT vault.update_secret(<uuid>, 'NUEVO_VALOR')` y
   actualizar `last_rotated_at` en `external_secrets`.

3. Nunca hacer `SELECT * FROM vault.decrypted_secrets` en logs, capturas de
   pantalla, o queries que se envíen por correo.
