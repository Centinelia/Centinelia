import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMAS, toAnthropicTool } from '../schemas';

const WRITE_TOOLS = ['inv_agregar_equipo', 'inv_actualizar_estatus', 'inv_asignar_cliente', 'inv_registrar_venta', 'inv_registrar_salida'] as const;

describe('inventory writer tool schemas', () => {
  for (const name of WRITE_TOOLS) {
    it(`${name} está registrada en TOOL_SCHEMAS`, () => {
      expect(TOOL_SCHEMAS[name]).toBeDefined();
    });

    it(`${name} genera Anthropic.Tool válido`, () => {
      const t = toAnthropicTool(TOOL_SCHEMAS[name]);
      expect(t.name).toBe(name);
      expect(t.input_schema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(50);
    });
  }

  it('inv_agregar_equipo tiene campos requeridos: oc, modelo, serie', () => {
    const t = toAnthropicTool(TOOL_SCHEMAS['inv_agregar_equipo']);
    expect((t.input_schema as any).required).toEqual(expect.arrayContaining(['oc', 'modelo', 'serie']));
  });

  it('inv_registrar_salida acepta array de series', () => {
    const t = toAnthropicTool(TOOL_SCHEMAS['inv_registrar_salida']);
    const seriesProp = (t.input_schema as any).properties.series;
    expect(seriesProp.type).toBe('array');
    expect(seriesProp.items.type).toBe('string');
  });
});
