-- Cambiar organizations.portal_token de uuid a token corto (12 chars, ~72 bits).
-- URL pasa de /portal/6ace2da9-8b61-4c9e-b0cb-814c4c60776b (36 chars)
--          a  /portal/V1StGXR8_Z5j                        (12 chars)
--
-- 72 bits sigue siendo cryptographically safe para tokens de URL (colisiones
-- astronomicamente improbables, brute-force imposible). Adicionalmente hay
-- magic-link email OTP en /setup para defense-in-depth.
--
-- Los UUIDs generados minutos antes por la migration 20260809_org_portal_token
-- nunca fueron distribuidos (todavia no hay nadie usando URLs de org token);
-- todos los bookmarks de clientes usan voice_agents.portal_token, que sigue
-- intacto y sigue haciendo 301 via proxy.ts.

-- Función generadora — usa pgcrypto (ya disponible en Supabase) para bytes
-- criptograficamente aleatorios, mapea a alfabeto URL-safe de 64 chars.
create extension if not exists pgcrypto;

create or replace function generate_short_token() returns text as $$
declare
  chars  text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  result text := '';
  i integer;
  b bytea;
begin
  b := gen_random_bytes(12);
  for i in 0..11 loop
    result := result || substr(chars, (get_byte(b, i) % 64) + 1, 1);
  end loop;
  return result;
end
$$ language plpgsql volatile;

-- Drop y re-add. Las constraints/indices se rebuildean con el nuevo tipo.
alter table organizations drop column portal_token;

alter table organizations add column portal_token text;
update organizations set portal_token = generate_short_token();
alter table organizations alter column portal_token set default generate_short_token();
alter table organizations alter column portal_token set not null;
alter table organizations add constraint organizations_portal_token_key unique (portal_token);
create index if not exists idx_organizations_portal_token on organizations(portal_token);

notify pgrst, 'reload schema';
