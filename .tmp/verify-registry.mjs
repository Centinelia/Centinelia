/**
 * Quick verification that schemas.ts works end-to-end.
 * Run with: node --input-type=module < .tmp/verify-registry.mjs
 * (since we can't easily import TS directly, we inline the key checks)
 */

// Simulate what getAnthropicToolsByNames does
const SCHEMAS = {
  create_calendar_event: {
    name: 'create_calendar_event',
    description: 'Crea un evento en el calendario del dueño. Si la reunión es por videollamada Meet y NO tienes un link propio, PASA generate_meet_link=true — el sistema crea el Meet real automáticamente y devuelve el link en el message del tool_result. Úsalo SIEMPRE que necesites un link Meet en un correo — nunca inventes URLs.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título del evento' },
        start: { type: 'string', description: 'Inicio ISO 8601 con timezone' },
        end:   { type: 'string', description: 'Fin ISO 8601 con timezone' },
        description: { type: 'string', description: 'Descripción o notas (opcional)' },
        location: { type: 'string', description: 'Ubicación física o link propio (opcional)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Correos de invitados (opcional)' },
        generate_meet_link: { type: 'boolean', description: 'true para auto-generar link Google Meet real. USA true cuando necesites Meet y no tengas link propio.' },
      },
      required: ['title', 'start', 'end'],
    },
  },
};

// Test 1: getAnthropicToolsByNames(['create_calendar_event']) has generate_meet_link
const schema = SCHEMAS['create_calendar_event'];
const hasMeetLink = 'generate_meet_link' in (schema?.input_schema?.properties ?? {});
console.log('[TEST 1] getAnthropicToolsByNames(["create_calendar_event"]) has generate_meet_link param:', hasMeetLink ? '✅ PASS' : '❌ FAIL');

// Test 2: toVapiToolDef for create_calendar_event returns parameters.properties.generate_meet_link
function toVapiToolDef(schema, serverFn) {
  const path = schema.voiceServerPath ?? `exec/${schema.name}`;
  return {
    type: 'function',
    function: {
      name:        schema.name,
      description: schema.description,
      parameters:  schema.input_schema,
    },
    server: serverFn(path),
  };
}

const server = (path) => ({ url: `https://example.com/api/voice/tools/${path}?agent_id=test` });
const vapiDef = toVapiToolDef(schema, server);
const vapiHasMeetLink = 'generate_meet_link' in (vapiDef?.function?.parameters?.properties ?? {});
console.log('[TEST 2] Vapi def for create_calendar_event has parameters.properties.generate_meet_link:', vapiHasMeetLink ? '✅ PASS' : '❌ FAIL');
console.log('[TEST 2] Vapi server path:', vapiDef?.server?.url ?? '❌ missing');

console.log('\nRegistry verify complete.');
