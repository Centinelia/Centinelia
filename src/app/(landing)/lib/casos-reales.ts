export interface Caso {
  slug:              string;
  empresa:           string;
  logoSrc:           string | null;
  metricaPrincipal:  string;
  contexto:          string;
  permiso:           boolean;
}

export const CASOS: Caso[] = [
  {
    slug:             'tortilleria-estrella',
    empresa:          'Tortillería Estrella',
    logoSrc:          null,
    metricaPrincipal: 'Nia contesta el 100% de las llamadas.',
    contexto:         'Distribuidora de tortilla en MTY. Antes perdían llamadas fuera de horario. Hoy Nia registra pedidos y escala incidencias al encargado.',
    permiso:          true,
  },
  {
    slug:             'ac-proyectos',
    empresa:          'AC Proyectos',
    logoSrc:          null,
    metricaPrincipal: 'Cotizaciones desde correo, sin captura manual.',
    contexto:         'Constructora que recibía cotizaciones de proveedor por correo. Nala parsea y crea OC en su sistema.',
    permiso:          false,
  },
];
