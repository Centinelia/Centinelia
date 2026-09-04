/**
 * scripts/verify-contpaqi-catalog.ts
 *
 * Verifica que la primera sync del writer .NET pobló los CSVs de catálogo
 * en el Dropbox del cliente. Referenciado en
 * `docs/billing/onboarding-nuevo-cliente.md` paso 5.
 *
 * Uso:
 *   npx tsx scripts/verify-contpaqi-catalog.ts <portal_email>
 *
 * Salida esperada (exit 0):
 *   ok: N clientes cargados, M productos cargados
 *   primeros clientes: [...]
 *   primeros productos: [...]
 *
 * Errores comunes:
 *   - "no existe organization_integrations type=contpaqi para <portal_email>"
 *     → Correr onboarding pasos 1-2 primero.
 *   - "Dropbox 404 /Facturacion/Config/contpaqi_clientes.csv"
 *     → El writer .NET aún no completó su primera sync. Verificar que el
 *       service está corriendo en la máquina del cliente y esperar al menos
 *       1 tick.
 *   - "encryption error" al desencriptar dropbox_token
 *     → ENCRYPTION_KEY del entorno no coincide con la que se usó al cifrar.
 */
import './_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildAdapter, type OrganizationIntegrationConfig } from '@/lib/billing/adapters';
import { CONTPAQiAdapter } from '@/lib/billing/adapters/contpaqi';

const portalEmail = process.argv[2];

if (!portalEmail) {
  console.error('uso: npx tsx scripts/verify-contpaqi-catalog.ts <portal_email>');
  process.exit(1);
}

async function main(): Promise<void> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle();

  if (error) {
    console.error(`error al leer organization_integrations: ${error.message}`);
    process.exit(2);
  }
  if (!row) {
    console.error(`no existe organization_integrations type=contpaqi para ${portalEmail}`);
    console.error('correr onboarding pasos 1-2 en docs/billing/onboarding-nuevo-cliente.md');
    process.exit(3);
  }

  const config = row.config as OrganizationIntegrationConfig;
  const adapter = buildAdapter(config);
  if (!(adapter instanceof CONTPAQiAdapter)) {
    console.error(`adapter no es CONTPAQiAdapter (type=${config.type}); nada que verificar`);
    process.exit(5);
  }

  const [clients, products] = await Promise.all([
    adapter.listAllClients(),
    adapter.listAllProducts(),
  ]);

  console.log(`ok: ${clients.length} clientes cargados, ${products.length} productos cargados`);
  console.log('');
  console.log('primeros 3 clientes:');
  for (const c of clients.slice(0, 3)) {
    console.log(`  - ${c.rfc}  ${c.razonSocial}`);
  }
  console.log('');
  console.log('primeros 3 productos:');
  for (const p of products.slice(0, 3)) {
    console.log(`  - [${p.sku}] ${p.nombre}  $${p.precio}`);
  }
}

main().catch(err => {
  console.error('verify failed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(4);
});
