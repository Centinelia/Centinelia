/**
 * Contract test para contpaqiTimbraProvider. Es un scaffold pendiente de
 * creds reales; el contract test protege que la shape general se mantenga
 * mientras el adapter madura.
 */

import { runProviderContract } from '../../__tests__/contract';
import { contpaqiTimbraProvider } from '../index';

runProviderContract('contpaqi_timbra', {
  provider:              () => contpaqiTimbraProvider,
  supportsRep:           false,  // scaffold hoy retorna 501 explícito
  hasSelfContainedMock:  false,
});
