export type Scenario = {
  id: 1 | 2 | 3 | 4;
  user_email: string;
  opening_message: string;
  shortcut_buttons: string[];
};

export const SCENARIOS: Record<number, Scenario> = {
  1: {
    id: 1,
    user_email: 'demo1@meefi.io',
    opening_message: 'Hola, necesito cambiar mi contraseña pero el sistema no me deja.',
    shortcut_buttons: ['Cambiar contraseña', 'No veo mi transferencia', 'Perdí mi 2FA', 'Otra duda'],
  },
  2: {
    id: 2,
    user_email: 'demo3@meefi.io',
    opening_message: 'Transferí 50 mil pesos hace 2 horas y no aparecen. ¿Qué está pasando?',
    shortcut_buttons: ['No veo mi transferencia', 'Cambiar contraseña', 'Perdí mi 2FA', 'Otra duda'],
  },
  3: {
    id: 3,
    user_email: 'demo2@meefi.io',
    opening_message: '¿Cuánto tarda una transferencia SPEI a otro banco?',
    shortcut_buttons: ['Comisiones', 'Tiempos SPEI', 'Cómo cambio contraseña', 'Otra duda'],
  },
  4: {
    id: 4,
    user_email: 'demo2@meefi.io',
    opening_message: 'Perdí mi celular con la app de autenticación. ¿Cómo recupero mi cuenta?',
    shortcut_buttons: ['Perdí mi 2FA', 'Cambiar contraseña', 'No veo mi transferencia', 'Otra duda'],
  },
};
