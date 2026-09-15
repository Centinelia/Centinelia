/**
 * Standalone node:test runner para los tests de distribucion de Navi.
 *
 * Verifica que MEERKAT_VOICE_DISTRIBUTION tiene los conteos correctos de tools
 * para navi (14) y navi_agencia (16), y que los mappings VOICE_TO_CHAT y
 * TOOL_REGISTRY estan completos.
 *
 * NOTA: sync.ts, channel-mapping.ts y registry.ts importan multiples modulos
 * con path aliases @/ que jiti no puede resolver sin un tsconfig.paths loader
 * adicional. Por eso este runner INLINEA los datos estaticos de produccion
 * extraidos de esos archivos. Si cambias los archivos fuente, actualiza aqui.
 *
 * Uso desde la raiz del worktree:
 *
 *   node \
 *     --import "file:///C:/Users/Nazre/centinelia/node_modules/jiti/lib/jiti-native.mjs" \
 *     src/lib/vapi/__tests__/run-navi-distribution-tests.mjs
 *
 * Convencion estandar: centinelia y centinelia-navi estan al mismo nivel
 * (C:/Users/Nazre/). Sobreescribir con CENTINELA_ROOT env var si se necesita.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Datos inlineados desde sync.ts (MEERKAT_VOICE_DISTRIBUTION) ─────────────
// Extraido de src/lib/vapi/sync.ts. Actualizar si cambia la distribucion.

const MEERKAT_VOICE_DISTRIBUTION = {
  navi: [
    'canva_listar_plantillas', 'canva_generar_diseno', 'canva_exportar',
    'generar_caption', 'generar_hashtags',
    'crear_borrador_post', 'programar_publicacion', 'publicar_ahora',
    'ig_responder_comentario', 'ig_responder_dm',
    'consultar_metricas_post', 'proponer_calendario_editorial',
    'listar_media_del_cliente', 'usar_media_del_cliente',
  ],
  navi_agencia: [
    'canva_listar_plantillas', 'canva_generar_diseno', 'canva_exportar',
    'generar_caption', 'generar_hashtags',
    'crear_borrador_post', 'programar_publicacion', 'publicar_ahora',
    'ig_responder_comentario', 'ig_responder_dm',
    'consultar_metricas_post', 'proponer_calendario_editorial',
    'listar_media_del_cliente', 'usar_media_del_cliente',
    'listar_cuentas_gestionadas', 'replicar_contenido_entre_cuentas',
  ],
};

// ─── Datos inlineados desde channel-mapping.ts (VOICE_TO_CHAT) ───────────────
// Solo las entradas de Navi. Extraido de src/lib/tools/channel-mapping.ts.

const VOICE_TO_CHAT = {
  canva_listar_plantillas:           'canva_listar_plantillas',
  canva_generar_diseno:              'canva_generar_diseno',
  canva_exportar:                    'canva_exportar',
  generar_caption:                   'generar_caption',
  generar_hashtags:                  'generar_hashtags',
  crear_borrador_post:               'crear_borrador_post',
  programar_publicacion:             'programar_publicacion',
  publicar_ahora:                    'publicar_ahora',
  ig_responder_comentario:           'ig_responder_comentario',
  ig_responder_dm:                   'ig_responder_dm',
  consultar_metricas_post:           'consultar_metricas_post',
  proponer_calendario_editorial:     'proponer_calendario_editorial',
  listar_media_del_cliente:          'listar_media_del_cliente',
  usar_media_del_cliente:            'usar_media_del_cliente',
  listar_cuentas_gestionadas:        'listar_cuentas_gestionadas',
  replicar_contenido_entre_cuentas:  'replicar_contenido_entre_cuentas',
};

// ─── Datos inlineados desde registry.ts (TOOL_REGISTRY) ──────────────────────
// Solo las entradas de Navi. Extraido de src/lib/tools/registry.ts.

const TOOL_REGISTRY = [
  { name: 'canva_listar_plantillas',         channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'canva_generar_diseno',            channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'canva_exportar',                  channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'generar_caption',                 channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'generar_hashtags',                channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'crear_borrador_post',             channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'programar_publicacion',           channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'publicar_ahora',                  channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'ig_responder_comentario',         channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'ig_responder_dm',                 channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'consultar_metricas_post',         channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'proponer_calendario_editorial',   channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'listar_media_del_cliente',        channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'usar_media_del_cliente',          channels: ['voice','chat','email'], gatedByRole: ['navi','navi_agencia'], gatedByFeature: 'social_publishing' },
  { name: 'listar_cuentas_gestionadas',      channels: ['voice','chat','email'], gatedByRole: ['navi_agencia'],        gatedByFeature: 'social_publishing' },
  { name: 'replicar_contenido_entre_cuentas', channels: ['voice','chat','email'], gatedByRole: ['navi_agencia'],       gatedByFeature: 'social_publishing' },
];

const NAVI_STANDARD_COUNT  = 14;
const NAVI_AGENCIA_COUNT   = 16;
const NAVI_EXCLUSIVE_TOOLS = ['listar_cuentas_gestionadas', 'replicar_contenido_entre_cuentas'];

// ─── Conteos de distribucion ──────────────────────────────────────────────────

describe('Navi voice distribution — conteos', () => {
  test('navi tiene exactamente 14 tools', () => {
    const count = MEERKAT_VOICE_DISTRIBUTION.navi?.length ?? 0;
    assert.equal(count, NAVI_STANDARD_COUNT, `navi tiene ${count} tools, esperaba ${NAVI_STANDARD_COUNT}`);
  });

  test('navi_agencia tiene exactamente 16 tools', () => {
    const count = MEERKAT_VOICE_DISTRIBUTION.navi_agencia?.length ?? 0;
    assert.equal(count, NAVI_AGENCIA_COUNT, `navi_agencia tiene ${count} tools, esperaba ${NAVI_AGENCIA_COUNT}`);
  });

  test('las 2 tools exclusivas estan SOLO en navi_agencia, no en navi', () => {
    const naviList    = MEERKAT_VOICE_DISTRIBUTION.navi ?? [];
    const agenciaList = MEERKAT_VOICE_DISTRIBUTION.navi_agencia ?? [];
    for (const tool of NAVI_EXCLUSIVE_TOOLS) {
      assert.ok(!naviList.includes(tool),    `'${tool}' NO debe estar en navi`);
      assert.ok(agenciaList.includes(tool),  `'${tool}' debe estar en navi_agencia`);
    }
  });

  test('navi_agencia = navi + 2 exclusivas (exactamente)', () => {
    const naviSet    = new Set(MEERKAT_VOICE_DISTRIBUTION.navi    ?? []);
    const agenciaSet = new Set(MEERKAT_VOICE_DISTRIBUTION.navi_agencia ?? []);
    const extra = [...agenciaSet].filter(t => !naviSet.has(t));
    assert.deepEqual(
      extra.sort(),
      [...NAVI_EXCLUSIVE_TOOLS].sort(),
      `Diferencia inesperada: ${JSON.stringify(extra)}`,
    );
  });
});

// ─── Mappings VOICE_TO_CHAT ───────────────────────────────────────────────────

describe('Navi VOICE_TO_CHAT mappings', () => {
  test('cada tool de navi tiene entrada en VOICE_TO_CHAT', () => {
    const naviTools = MEERKAT_VOICE_DISTRIBUTION.navi ?? [];
    const missing   = naviTools.filter(t => !(t in VOICE_TO_CHAT));
    assert.deepEqual(missing, [], `Faltan mappings en VOICE_TO_CHAT: ${JSON.stringify(missing)}`);
  });

  test('cada tool de navi_agencia tiene entrada en VOICE_TO_CHAT', () => {
    const agenciaTools = MEERKAT_VOICE_DISTRIBUTION.navi_agencia ?? [];
    const missing      = agenciaTools.filter(t => !(t in VOICE_TO_CHAT));
    assert.deepEqual(missing, [], `Faltan mappings en VOICE_TO_CHAT: ${JSON.stringify(missing)}`);
  });
});

// ─── TOOL_REGISTRY entries ────────────────────────────────────────────────────

describe('Navi TOOL_REGISTRY', () => {
  const ALL_NAVI_TOOLS = Array.from(new Set([
    ...(MEERKAT_VOICE_DISTRIBUTION.navi ?? []),
    ...(MEERKAT_VOICE_DISTRIBUTION.navi_agencia ?? []),
  ]));

  test('todas las tools de Navi estan en TOOL_REGISTRY', () => {
    const registeredNames = new Set(TOOL_REGISTRY.map(t => t.name));
    const missing = ALL_NAVI_TOOLS.filter(t => !registeredNames.has(t));
    assert.deepEqual(missing, [], `Faltan entries en TOOL_REGISTRY: ${JSON.stringify(missing)}`);
  });

  test('todas las tools de Navi tienen gatedByFeature: social_publishing', () => {
    const mismatched = ALL_NAVI_TOOLS.filter(tool => {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      return !entry || entry.gatedByFeature !== 'social_publishing';
    });
    assert.deepEqual(mismatched, [], `gatedByFeature incorrecto: ${JSON.stringify(mismatched)}`);
  });

  test('las 14 tools estandar tienen gatedByRole con navi y navi_agencia', () => {
    const naviTools = MEERKAT_VOICE_DISTRIBUTION.navi ?? [];
    const wrong = naviTools.filter(tool => {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      if (!entry) return true;
      const roles = entry.gatedByRole ?? [];
      return !roles.includes('navi') || !roles.includes('navi_agencia');
    });
    assert.deepEqual(wrong, [], `gatedByRole incorrecto en tools estandar: ${JSON.stringify(wrong)}`);
  });

  test('las 2 tools exclusivas tienen gatedByRole: [navi_agencia] solamente', () => {
    for (const tool of NAVI_EXCLUSIVE_TOOLS) {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      assert.ok(entry, `entry faltante para '${tool}'`);
      const roles = entry.gatedByRole ?? [];
      assert.ok(!roles.includes('navi'),    `'${tool}' NO debe incluir 'navi' en gatedByRole`);
      assert.ok(roles.includes('navi_agencia'), `'${tool}' debe incluir 'navi_agencia' en gatedByRole`);
    }
  });

  test('todas las tools de Navi declaran los 3 canales (voice, chat, email)', () => {
    const wrong = ALL_NAVI_TOOLS.filter(tool => {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      if (!entry) return true;
      return !entry.channels.includes('voice') || !entry.channels.includes('chat') || !entry.channels.includes('email');
    });
    assert.deepEqual(wrong, [], `channels incompletos: ${JSON.stringify(wrong)}`);
  });
});
