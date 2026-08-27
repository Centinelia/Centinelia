// Expande abreviaturas comunes que aparecen en direcciones y textos que van a
// TTS. El LLM captura direcciones tal cual el cliente las dicta ("Ave. Test",
// "Blvd Constitución", "Col. Centro") y ElevenLabs las lee literales ("A-ve",
// "Bel-ve-de"), lo que suena roto por teléfono. Aplicamos justo antes de
// enviar a Vapi para no modificar el dato guardado en DB (el owner ve la
// dirección tal cual el cliente la dictó).
//
// Reglas:
// - Case-insensitive.
// - Word boundary al inicio y punto/espacio al final para no partir palabras
//   reales ("Avelina" no se toca porque el pattern exige separador post-Ave).
// - Solo abreviaturas MX/ES de uso frecuente en direcciones y contactos.

const REPLACEMENTS: { pattern: RegExp; replacement: string }[] = [
  // Vías
  { pattern: /\b(av|ave)\.?(?=\s)/gi,          replacement: 'Avenida'      },
  { pattern: /\b(blvd|bulv)\.?(?=\s)/gi,       replacement: 'Boulevard'    },
  { pattern: /\bcalz\.?(?=\s)/gi,              replacement: 'Calzada'      },
  { pattern: /\bpriv\.?(?=\s)/gi,              replacement: 'Privada'      },
  { pattern: /\bcarr\.?(?=\s)/gi,              replacement: 'Carretera'    },
  { pattern: /\bpje\.?(?=\s)/gi,               replacement: 'Pasaje'       },
  { pattern: /\band\.?(?=\s)/gi,               replacement: 'Andador'      },
  { pattern: /\bcda\.?(?=\s)/gi,               replacement: 'Cerrada'      },
  // Zonas
  { pattern: /\bcol\.?(?=\s)/gi,               replacement: 'Colonia'      },
  { pattern: /\bfracc\.?(?=\s)/gi,             replacement: 'Fraccionamiento' },
  { pattern: /\bres\.?(?=\s)/gi,               replacement: 'Residencial'  },
  // Numeración
  { pattern: /\b(no|núm|num)\.?(?=\s*\d)/gi,   replacement: 'número'       },
  { pattern: /#(?=\s*\d)/g,                    replacement: 'número '      },
  { pattern: /\bc\.?p\.?(?=\s*\d)/gi,          replacement: 'código postal' },
  { pattern: /\bkm\.?(?=\s*\d)/gi,             replacement: 'kilómetro'    },
  { pattern: /\bmz\.?(?=\s*\d)/gi,             replacement: 'manzana'      },
  { pattern: /\blt\.?(?=\s*\d)/gi,             replacement: 'lote'         },
  { pattern: /\bdepto\.?(?=\s)/gi,             replacement: 'departamento' },
  { pattern: /\bdept\.?(?=\s)/gi,              replacement: 'departamento' },
  // Estados/entidades (cuando aparecen en el motivo, no en el dato canónico)
  { pattern: /\bsta\.?(?=\s)/gi,               replacement: 'Santa'        },
  { pattern: /\bsto\.?(?=\s)/gi,               replacement: 'Santo'        },
  { pattern: /\bsn\.?(?=\s)/gi,                replacement: 'San'          },
];

export function expandForSpeech(text: string | null | undefined): string {
  if (!text) return '';
  let out = text;
  for (const { pattern, replacement } of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Colapsa espacios múltiples que hayan quedado tras remover puntos.
  return out.replace(/\s{2,}/g, ' ').trim();
}
