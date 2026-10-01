import { describe, it, expect } from 'vitest';
import { filterWriteToolsByFlag, INVENTORY_WRITE_TOOL_NAMES } from '../inventory-write-flag';

const dummyTool = (name: string) => ({ name, description: 'x', input_schema: { type: 'object' as const, properties: {}, required: [] } });

describe('filterWriteToolsByFlag', () => {
  it('flag=false → remueve las 5 writes del array', () => {
    const input = [
      ...INVENTORY_WRITE_TOOL_NAMES.map(dummyTool),
      dummyTool('inv_buscar_por_serie'),
      dummyTool('enviar_correo'),
    ];
    const result = filterWriteToolsByFlag(input, {});
    expect(result.map(t => t.name)).toEqual(['inv_buscar_por_serie', 'enviar_correo']);
  });

  it('flag=true → preserva las 5 writes', () => {
    const input = INVENTORY_WRITE_TOOL_NAMES.map(dummyTool);
    const result = filterWriteToolsByFlag(input, { inventory_write_enabled: true });
    expect(result).toHaveLength(5);
  });

  it('features null → trata como flag=false', () => {
    const input = [dummyTool('inv_agregar_equipo'), dummyTool('inv_buscar_por_serie')];
    const result = filterWriteToolsByFlag(input, null as never);
    expect(result.map(t => t.name)).toEqual(['inv_buscar_por_serie']);
  });

  it('flag no-boolean truthy ("yes") → trata como false (type-strict)', () => {
    const input = [dummyTool('inv_agregar_equipo')];
    const result = filterWriteToolsByFlag(input, { inventory_write_enabled: 'yes' as never });
    expect(result).toEqual([]);
  });
});
