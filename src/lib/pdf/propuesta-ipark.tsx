import { OnePagerPdf } from './one-pager';
import type { BrandKit } from '@/lib/brand/kit';

/**
 * Propuesta ejecutiva Nala facturista para IPark Estacionamientos.
 *
 * Contenido cerrado en el archivo — no requiere datos runtime del cliente.
 * Se genera vía /api/admin/demos/ipark/propuesta como PDF descargable.
 *
 * Contenido source-of-truth: demos/ipark/04-propuesta-ejecutiva.md.
 * Cualquier ajuste al copy debe hacerse en AMBOS lugares hasta que
 * decidamos si el .md es solo referencia o si generamos el PDF desde él.
 */

const CENTINELIA_BRAND: BrandKit = {
  businessName:   'Centinelia',
  logoUrl:        null,
  color:          '#6C3BFF',
  colorSecondary: null,
  phone:          '+52 81 1633 3559',
  website:        'centinelia.mx',
  address:        'Monterrey, Nuevo León',
  footerText:     'Centinelia · Empleados digitales para PYMEs',
};

export function PropuestaIparkPdf() {
  return (
    <OnePagerPdf
      brand={CENTINELIA_BRAND}
      title="Propuesta Nala facturista · IPark Estacionamientos"
      sections={[
        {
          heading: 'El problema',
          body: 'IPark maneja aprox. 35,000 CFDIs/mes vía InvoiceOne. La mayoría se timbra sin intervención humana (auto-facturación + portal público). Sin embargo, aprox. 1,000 correos/mes llegan a un inbox de facturación y hoy los resuelve una persona a mano: leer, extraer datos, timbrar, responder con CFDI.',
          bullets: [
            '5-10 minutos de trabajo humano por correo',
            '80-165 horas/mes dedicadas a trabajo repetitivo',
            'Prorrateado: MXN $15-25 mil/mes en salario disperso',
          ],
        },
        {
          heading: 'La propuesta',
          body: 'Nala IPark, facturista digital de Centinelia conectada al inbox actual de facturación:',
          bullets: [
            'Lee todos los correos entrantes con filtro estricto',
            'Solo actúa sobre los que claramente piden factura',
            'Extrae RFC, folio, uso CFDI y demás datos fiscales',
            'Timbra vía InvoiceOne API bajo la cuenta actual de IPark',
            'Responde al cliente con XML+PDF en el idioma del mensaje',
            'Escala a humano los casos que requieren criterio',
          ],
        },
        {
          heading: 'Lo que NO cambia',
          body: 'La propuesta es aditiva, no disruptiva. Cero cambios en el stack fiscal de IPark.',
          bullets: [
            'InvoiceOne sigue siendo el PAC · cero cambio fiscal',
            'Portal público de autoservicio se queda igual',
            'La persona actual pasa de ejecutar a auditar',
            'La dirección pública de correo no cambia (setup por reenvío)',
          ],
        },
        {
          heading: 'Alcance POC · 30 días',
          body: '',
          bullets: [
            'Días 1-5: setup técnico. Reenvío del inbox + credenciales InvoiceOne',
            'Días 6-20: operación supervisada. Humano audita cada respuesta antes de salir',
            'Días 21-30: operación directa. Nala responde sin intervención previa, escala automático',
            'Día 30: revisión de métricas y cotización de operación estable',
          ],
        },
        {
          heading: 'Métricas de éxito del POC',
          body: '',
          bullets: [
            '% de correos resueltos sin escalar (objetivo: 80%+)',
            'Tiempo promedio de respuesta al cliente (objetivo: <5 min)',
            'Horas humanas ahorradas al mes vs baseline',
            'Cero facturas mal emitidas',
            'Satisfacción del cliente que interactúa con Nala',
          ],
        },
        {
          heading: 'Inversión',
          body: 'POC simbólico. Mensualidad post-POC anclada en métricas reales.',
          bullets: [
            'POC 30 días: MXN $3,000-5,000 (setup técnico + calibración + supervisión)',
            'Operación mensual estable: MXN $9,000-14,000/mes (cotización final con datos POC)',
            'Sin costo de software adicional · InvoiceOne sigue pagado directo por IPark',
          ],
        },
        {
          heading: 'Siguientes pasos',
          body: '',
          bullets: [
            'Confirmación de interés del equipo IPark',
            'Firma de acuerdo POC (1 página, sin candados post-POC)',
            'Kickoff técnico: credenciales InvoiceOne + acceso al inbox por reenvío',
            'Arranque del POC 3-5 días laborales después del kickoff',
          ],
        },
      ]}
      cta="Nala trabaja 24/7. No pide vacaciones. No se enferma. No se distrae. Y el equipo humano de IPark pasa de responder 1,000 correos al mes a auditar 200 y atender los casos que sí requieren criterio."
    />
  );
}
