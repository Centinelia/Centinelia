/**
 * Texto del protocolo de captura crítica de CURP para voz.
 * Se injecta solo cuando el agente tiene al menos un trámite activo con
 * campos de tipo curp.
 */
export const CAPTURE_PROTOCOL_CURP = `PROTOCOLO DE CAPTURA CRÍTICA DE CURP (obligatorio cuando captures un CURP para un trámite):

Un CURP tiene 18 caracteres en 3 bloques: 4 letras, 6 números (fecha de nacimiento AAMMDD), 8 alfanuméricos.

1. Pide el CURP en voz baja y clara: "Por favor dígame su CURP, es de 18 caracteres. Vamos a ir por partes."
2. Captura por bloques:
   - Bloque 1: "Dígame las primeras 4 letras."
   - Bloque 2: "Ahora los 6 números de su fecha de nacimiento."
   - Bloque 3: "Y los últimos 8 caracteres."
3. Después de cada bloque, repite lo capturado LETRA POR LETRA usando el alfabeto fonético para letras que suenan parecidas. Confirma antes de pasar al siguiente bloque.
4. Usa el siguiente alfabeto fonético para desambiguar:
   - B como Barcelona, V como Venezuela, M como México, N como Norte
   - D como Delta, T como Tango, P como Papá, F como Francia
   - S como Sierra, C como Carlos, Z como Zapato
   - G como Guadalajara, J como José
5. Si la persona corrige, vuelve a leer TODO el bloque de nuevo antes de continuar.
6. Al final, lee el CURP completo una vez más y confirma antes de enviarlo.

Ejemplo: si dictaron "MOAE121121MNLLDRA3", léelo así: "Confirmo: eme como México, o, a, e, uno, dos, uno, uno, dos, uno, eme como México, ene como Norte, ele, ele, de como Delta, erre, a, tres. ¿Es correcto?"

NUNCA envíes un CURP al padrón sin haber ejecutado este protocolo completo.`;

export const CAPTURE_PROTOCOL_EMAIL = `PROTOCOLO DE CAPTURA DE CORREO ELECTRÓNICO:
1. Pide primero el dominio: "¿Su correo es de gmail, hotmail, yahoo, outlook, u otro?"
2. Luego pide el nombre de usuario letra por letra.
3. Confirma repitiendo todo con alfabeto fonético para letras confusas.
4. Si el ciudadano prefiere no dictar, ofrécele: "Puedo enviarle una confirmación por otro medio; también podemos continuar sin correo, no es obligatorio."`;

export const CAPTURE_PROTOCOL_TELEFONO = `PROTOCOLO DE CAPTURA DE TELÉFONO:
1. Pide el número en grupos: "Dígame los primeros 3 dígitos... ahora los 3 siguientes... y los últimos 4."
2. Repite el número completo agrupado antes de confirmar.
3. Valida que sean 10 dígitos.`;
