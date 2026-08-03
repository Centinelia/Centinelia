/**
 * Reproduces getToolsForRole('nox', qb=false, notion=false) offline to confirm
 * whether extraer_voz_del_cliente is really being registered.
 */
import { MEERKAT_VOICE_DISTRIBUTION } from '../../src/lib/vapi/sync';

const meerkatId = 'nox';
const voiceNames = MEERKAT_VOICE_DISTRIBUTION[meerkatId];
console.log('MEERKAT_VOICE_DISTRIBUTION[nox]:');
console.log(voiceNames);
console.log('\nContains extraer_voz_del_cliente?', voiceNames?.includes('extraer_voz_del_cliente'));
