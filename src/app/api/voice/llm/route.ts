/**
 * Compatibility route for Vapi custom-LLM.
 *
 * Vapi documented behavior: appends '/chat/completions' to the configured URL.
 * As of 2026-07-30 they stopped doing this and POST directly to the base URL,
 * which used to be handled by /api/voice/llm/chat/completions/route.ts. This
 * file delegates any POST at the base path to the same handler, so both URL
 * variants work regardless of Vapi's current behavior.
 */

export { POST } from './chat/completions/route';
export { dynamic, runtime } from './chat/completions/route';
