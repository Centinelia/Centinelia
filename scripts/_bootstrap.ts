/**
 * Carga .env.local en scripts que corren con `npx tsx`. Next.js hace esto
 * automáticamente cuando corre el server, pero los scripts standalone no
 * tienen ese lujo. Importar este archivo al inicio de cualquier script:
 *
 *   import './_bootstrap';   // primer import, antes de cualquier otra cosa
 *
 * Usa @next/env que ya viene con Next.js — no requiere `dotenv` extra.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());
