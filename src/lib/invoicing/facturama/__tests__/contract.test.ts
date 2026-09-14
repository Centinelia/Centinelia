/**
 * Contract test para facturamaProvider. Facturama usa REST/JSON via
 * `facturamaJsonCall`. En el ambiente de test no hay red — el fetch va a
 * fallar con "fetch failed". El contrato exige que el adapter atrape ese
 * error y retorne StampResult/CancelSubmitResult/CancelStatus con shape
 * válido, NUNCA lance.
 *
 * Si este test falla en el "never throws" es un bug real del adapter.
 */

import { runProviderContract } from '../../__tests__/contract';
import { facturamaProvider } from '../index';

runProviderContract('facturama', {
  provider:              () => facturamaProvider,
  supportsRep:           true,   // Facturama sí soporta REP
  hasSelfContainedMock:  false,  // requiere red — solo probamos el contrato de errores
});
