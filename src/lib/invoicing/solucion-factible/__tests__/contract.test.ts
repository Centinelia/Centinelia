/**
 * Contract test para solucionFactibleProvider. SF usa SOAP.
 */

import { runProviderContract } from '../../__tests__/contract';
import { solucionFactibleProvider } from '../index';

runProviderContract('solucion-factible', {
  provider:              () => solucionFactibleProvider,
  supportsRep:           true,
  hasSelfContainedMock:  false,
});
