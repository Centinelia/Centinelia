import { resolveMeerkatConfig, clearMeerkatVersionCache } from '@/lib/vapi/resolve-meerkat';

async function main() {
  clearMeerkatVersionCache();

  // Caso 1: meerkat conocido sin pin
  const nia = await resolveMeerkatConfig('nia', null);
  console.log('nia (no pin):', nia.model, 'temp=', nia.temperature);

  // Caso 2: meerkat conocido con pin válido
  const niaPin1 = await resolveMeerkatConfig('nia', 1);
  console.log('nia (pin=1):', niaPin1.model);

  // Caso 3: meerkat conocido con pin inválido (debe caer a active + warn)
  const niaPinBad = await resolveMeerkatConfig('nia', 99);
  console.log('nia (pin=99, invalid):', niaPinBad.model);

  // Caso 4: meerkat desconocido (debe retornar DEFAULT + warn)
  const unknown = await resolveMeerkatConfig('zzz', null);
  console.log('zzz (unknown):', unknown.model);

  // Caso 5: cache hit (segunda call no debe llamar DB — visible por ausencia de log)
  const niaAgain = await resolveMeerkatConfig('nia', null);
  console.log('nia (cache):', niaAgain.model);
}

main();
