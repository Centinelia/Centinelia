/**
 * Contract test para invoiceoneProvider. Corre el suite compartido de
 * `contract.ts` — invoiceone tiene modo mock self-contained, así que puede
 * validar happy path completo sin transport.
 */

import { runProviderContract } from '../../__tests__/contract';
import { invoiceOneProvider } from '../index';

runProviderContract('invoiceone', {
  provider:              () => invoiceOneProvider,
  supportsRep:           false,  // mock explícitamente retorna 501
  hasSelfContainedMock:  true,   // creds 'demo/demo' → mock branch
});
