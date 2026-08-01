import type { Tramite, Campo } from './types';
import { CAPTURE_PROTOCOL_CURP, CAPTURE_PROTOCOL_EMAIL, CAPTURE_PROTOCOL_TELEFONO } from './capture-protocol';

function describeCampo(c: Campo): string {
  const req = c.required ? 'obligatorio' : 'opcional';
  switch (c.tipo) {
    case 'curp':
      return `${c.key} (CURP, ${req}) — captura con protocolo crítico. Si tiene autocomplete via padrón, primero llama buscar_en_padron_externo y si trae datos confírmalos con la persona.`;
    case 'catalogo_pick':
      return `${c.key} (opción de catálogo "${c.catalogo}", ${req}) — llama consultar_catalogo_externo, ofrece las opciones y captura la elección.`;
    case 'catalogo_search':
      return `${c.key} (búsqueda en catálogo "${c.catalogo}", ${req}) — pide un texto del ciudadano y usa consultar_catalogo_externo con el filtro correspondiente.`;
    case 'cp':
      return `${c.key} (código postal, 5 dígitos, ${req}).`;
    case 'email':
      return `${c.key} (correo electrónico, ${req}) — usa el protocolo de captura de correo.`;
    case 'telefono_mx':
      return `${c.key} (teléfono 10 dígitos, ${req}) — usa el protocolo de captura de teléfono.`;
    case 'fecha':
      return `${c.key} (fecha AAAA-MM-DD, ${req}).`;
    case 'consentimiento':
      return `${c.key} (consentimiento explícito del aviso de privacidad, ${req}) — DEBE ser el último paso antes de enviar.`;
    default:
      return `${c.key} (${c.tipo}, ${req})${c.prompt_captura ? ` — ${c.prompt_captura}` : ''}`;
  }
}

function renderTramite(t: Tramite): string {
  const camposOrdenados = t.campos.slice().sort((a, b) => a.orden - b.orden);
  const pasos = camposOrdenados.map((c, i) => `${i + 1}. ${describeCampo(c)}`).join('\n');
  const avisoBlock = t.aviso_privacidad_texto
    ? `\nAviso de privacidad — LEE al ciudadano antes de capturar cualquier dato personal, y confirma verbalmente que acepta:\n"${t.aviso_privacidad_texto}"\n${t.aviso_privacidad_url ? `Documento completo: ${t.aviso_privacidad_url}` : ''}`
    : '';
  const reglas = t.reglas_negocio;
  const reglasBlock = [
    reglas.max_registros_por_sesion ? `- Máximo ${reglas.max_registros_por_sesion} registro(s) por conversación.` : '',
    reglas.allow_manual_capture_on_padron_miss === false ? `- Si el CURP no aparece en padrón, informa al ciudadano de forma amable que no puede continuar por este canal y ofrece dirigirlo al portal web o a un módulo presencial.` : '',
  ].filter(Boolean).join('\n');

  return `### ${t.nombre_publico} (tramite_id: ${t.id})
${t.descripcion_agente}
${avisoBlock}

Pasos de captura (respeta el orden):
${pasos}

${reglasBlock ? `Reglas de negocio:\n${reglasBlock}\n` : ''}Al terminar la captura completa y con consentimiento otorgado, llama \`enviar_tramite_externo\` con \`tramite_id="${t.id}"\` y un objeto \`campos\` con todos los valores. Comunica el folio devuelto al ciudadano. Si el envío falla con \`escalate: true\`, invoca \`pedir_a_humano\` con el contexto del trámite y los datos capturados.`;
}

export function renderTramitesSection(tramites: Tramite[]): string {
  if (tramites.length === 0) return '';
  const anyCurp  = tramites.some(t => t.campos.some(c => c.tipo === 'curp'));
  const anyEmail = tramites.some(t => t.campos.some(c => c.tipo === 'email'));
  const anyTel   = tramites.some(t => t.campos.some(c => c.tipo === 'telefono_mx'));

  const protocols: string[] = [];
  if (anyCurp)  protocols.push(CAPTURE_PROTOCOL_CURP);
  if (anyEmail) protocols.push(CAPTURE_PROTOCOL_EMAIL);
  if (anyTel)   protocols.push(CAPTURE_PROTOCOL_TELEFONO);

  const tramitesMd = tramites.map(renderTramite).join('\n\n');

  return `TRÁMITES EXTERNOS QUE PUEDES GESTIONAR

Cuando el ciudadano solicite uno de estos servicios, síguelo paso a paso.

${tramitesMd}

${protocols.length ? '\n' + protocols.join('\n\n') : ''}`;
}
