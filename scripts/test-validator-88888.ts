import { validateDraft } from '../src/lib/ops/draft-validator';
const summary = `Se pidió registrar la OC TEST-88888 (Trane, 07-oct-2026, modelo TWE12043AAAP01H, 1 pieza, USD 100.00). No pude registrarla porque la hoja de OC no está configurada. La herramienta devolvió 'sheet_no_configurado' al buscar y al agregar la fila. Mi solicitud al equipo con pedir_a_humano también falló. El correo no trae PDF adjunto visible.`;
const draft = `Hola Nazre,\n\nRecibí tu solicitud para registrar la OC TEST-88888 (Proveedor: Trane, Fecha: 07-oct-2026, Modelo TWE12043AAAP01H, 1 pieza, Precio USD 100.00).\n\nNo pude registrarla. Al intentarlo, el sistema respondió que la hoja de OC no está configurada (sheet_no_configurado), así que no se guardó ningún dato. Tampoco veo el PDF adjunto en el correo, así que no pude leerlo.\n\nPara continuar necesito ...`;
const r = validateDraft({ summary, draft, agentName: 'Nami', teamHumanNames: ['Nazre Assad'], toolsActuallyInvoked: [] });
console.log('ok:', r.ok);
console.log('violations:', r.violations.length);
for (const v of r.violations) console.log(`  [${v.kind}] excerpt: ${v.excerpt.slice(0, 100)}`);
