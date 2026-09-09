/**
 * scripts/upload-tortilleria-mapping.ts
 *
 * Convierte los CSV/JSON que Beatriz llenó en un TortilleriaMapping y lo
 * persiste en voice_agents.features.tortilleria_mapping para el meerkat Nala.
 *
 * Uso:
 *   npx tsx scripts/upload-tortilleria-mapping.ts <agent_id>
 *
 * Ejemplo:
 *   npx tsx scripts/upload-tortilleria-mapping.ts e3bad8c7-bddd-4a3a-9727-b90d3ed7272a
 *
 * Inputs (paths fijos):
 *   scripts/output/beatriz-mapping-consolidado.json  (bloques → códigos)
 *   scripts/output/beatriz-product-mapping.csv       (columna+precio → SKU)
 */
import './_bootstrap';
import { readFileSync } from 'fs';
import { join } from 'path';
import { saveTortilleriaMapping } from '@/lib/billing/tortilleria/mapping-store';
import type {
  TortilleriaMapping,
  ClientMappingEntry,
  ProductMappingEntry,
  ConsolidationRule,
} from '@/lib/billing/tortilleria/types';

const OUT = join(__dirname, 'output');

// ---- Load consolidated blocks ---------------------------------------------

interface ConsolidatedBlock {
  archivo:        string;
  bloque:         number;
  titulo:         string;
  codigo:         string | null;
  in_catalog?:    boolean;
  razon?:         string | null;
  rfc?:           string | null;
  skip?:          boolean;
  pending?:       boolean;
  pending_reason?: string | null;
  notas_internas?: string;
}

function loadConsolidated(): ConsolidatedBlock[] {
  const raw = readFileSync(join(OUT, 'beatriz-mapping-consolidado.json'), 'utf-8');
  return JSON.parse(raw) as ConsolidatedBlock[];
}

// ---- Load product mapping CSV ---------------------------------------------

interface ProductRow {
  columna_excel:  string;
  precio_tipico:  number;
  sku_contpaqi:   string;
  nombre_contpaqi: string;
  clave_sat:      string;
  unidad_sat:     string;
  notas:          string;
}

function loadProducts(): ProductRow[] {
  const raw = readFileSync(join(OUT, 'beatriz-product-mapping.csv'), 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows: ProductRow[] = [];
  // Simple CSV parser: soporta comillas dobles.
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 8) continue;
    rows.push({
      columna_excel:   cells[0],
      precio_tipico:   Number(cells[1]),
      // cells[2] = visto_en_bloques (ignorado)
      sku_contpaqi:    cells[3],
      nombre_contpaqi: cells[4],
      clave_sat:       cells[5],
      unidad_sat:      cells[6],
      notas:           cells[7],
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ---- Build the mapping ----------------------------------------------------

function buildMapping(blocks: ConsolidatedBlock[], products: ProductRow[]): TortilleriaMapping {
  // Clients: agregar entries para cada bloque con código o skip.
  const clientMap = new Map<string, ClientMappingEntry>();
  for (const b of blocks) {
    if (b.skip) {
      // Descontinuados: agregar entrada de skip por título.
      const key = b.titulo.trim().toUpperCase();
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          titlePattern: b.titulo.trim(),
          codigo:       '',
          skip:         true,
          notes:        b.pending_reason ?? 'Cliente descontinuado (no se factura)',
        });
      }
      continue;
    }
    if (!b.codigo) continue;

    // Agregar entry por título. Si múltiples bloques comparten título, el
    // primero gana (el mapping se aplica una vez por título).
    const key = b.titulo.trim().toUpperCase();
    if (clientMap.has(key)) continue;

    clientMap.set(key, {
      titlePattern: b.titulo.trim(),
      codigo:       b.codigo,
      razon:        b.razon ?? undefined,
      rfc:          b.rfc ?? undefined,
      notes:        b.notas_internas,
    });
  }

  // Products: cada renglón con SKU llenado se convierte en un entry.
  const productEntries: ProductMappingEntry[] = [];
  for (const p of products) {
    if (!p.sku_contpaqi.trim()) continue;
    productEntries.push({
      columnaPattern:  p.columna_excel.trim(),
      precioRange:     null, // aplica a cualquier precio (Beatriz agrupó por columna+precio, pero el mapping es más general)
      sku:             p.sku_contpaqi.trim(),
      nombreContpaqi:  p.nombre_contpaqi.trim(),
      claveSat:        p.clave_sat.trim() || '50161509',
      unidadSat:       p.unidad_sat.trim() || 'KGM',
      notes:           p.notas || undefined,
    });
  }

  // Consolidation rules: DCA
  const consolidationRules: ConsolidationRule[] = [
    {
      matchPrefix:       'DCA',
      consolidateToCode: 'DCA',
      reason:            'Beatriz consolida todos los bloques DCA en 1 CFDI a razón social DCA',
    },
  ];

  // Credit codes: SILLATPROP (Adan Hugo Martinez a crédito)
  const creditCodes = ['SILLATPROP'];

  return {
    version:            '1.0',
    updatedAt:          new Date().toISOString(),
    creditCodes,
    consolidationRules,
    clients:            Array.from(clientMap.values()),
    products:           productEntries,
  };
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error('Uso: npx tsx scripts/upload-tortilleria-mapping.ts <agent_id>');
    process.exit(1);
  }

  const blocks = loadConsolidated();
  const products = loadProducts();
  const mapping = buildMapping(blocks, products);

  console.log('Mapping construido:');
  console.log(`  ${mapping.clients.length} clientes (incluyendo ${mapping.clients.filter(c => c.skip).length} skip)`);
  console.log(`  ${mapping.products.length} productos`);
  console.log(`  ${mapping.consolidationRules.length} reglas de consolidación`);
  console.log(`  ${mapping.creditCodes.length} códigos de crédito (PPD)`);
  console.log();

  await saveTortilleriaMapping(agentId, mapping);
  console.log(`OK: mapping guardado en voice_agents.features.tortilleria_mapping (agent_id=${agentId})`);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(2);
});
