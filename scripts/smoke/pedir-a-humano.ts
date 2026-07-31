#!/usr/bin/env tsx
/**
 * Smoke test manual del handler pedir_a_humano.
 *
 * Testea guards y validación básica. NO hace INSERT real.
 *
 * Ejecutar:
 *   npx tsx scripts/smoke/pedir-a-humano.ts
 */

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Smoke test manual: pedir_a_humano handler');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Verificar en local que:\n');

  console.log('1. Kill switch env HUMAN_HANDOFF_ENABLED=false');
  console.log('   → handler retorna error "deshabilitado globalmente"\n');

  console.log('2. Kill switch org: human_handoff_disabled_at en organizations');
  console.log('   → handler retorna error "deshabilitado para esta organización"\n');

  console.log('3. Feature flag agente: features.human_handoff_enabled = false');
  console.log('   → handler retorna error "deshabilitado para este empleado"\n');

  console.log('4. Trust stage <= 1');
  console.log('   → handler retorna error "Trust Stage 1 no permite"\n');

  console.log('5. Anti-loop: 4to intento sobre mismo source_inbox_id');
  console.log('   → handler retorna error "Ya solicitaste ayuda 3 veces"\n');

  console.log('6. Target sin email seteado (approver sin approval_email ni client_email)');
  console.log('   → handler retorna error "No hay destinatario configurado"\n');

  console.log('7. Happy path: INSERT OK');
  console.log('   → handler retorna { ok: true, request_id, target_email }');
  console.log('   → row creada en human_requests');
  console.log('   → notificación disparada (non-blocking)\n');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Este smoke es INFORMATIVO. Para tests automatizados usa:');
  console.log('  npx tsx scripts/eval/run-pedir-a-humano.ts');
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

void main();
