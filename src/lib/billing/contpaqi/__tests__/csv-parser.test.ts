import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseClientsCsv, parseProductsCsv, parseFreshnessJson } from '../csv-parser';

const fixtureDir = path.join(__dirname, 'fixtures');

describe('CONTPAQi CSV parser', () => {
  it('parseClientsCsv reads all fields', () => {
    const csv = fs.readFileSync(path.join(fixtureDir, 'contpaqi_clientes.example.csv'), 'utf8');
    const clients = parseClientsCsv(csv);
    expect(clients).toHaveLength(2);
    expect(clients[0]).toEqual({
      rfc: 'TDM040101ABC',
      adapterId: '42',
      razonSocial: 'TORTAS DONA MARIA SA',
      usoCFDI: 'G03',
      regimen: '601',
      codigoPostal: '64000'
    });
  });

  it('parseClientsCsv handles quoted commas', () => {
    const csv = fs.readFileSync(path.join(fixtureDir, 'contpaqi_clientes.example.csv'), 'utf8');
    const clients = parseClientsCsv(csv);
    expect(clients[1].razonSocial).toBe('CONSULTORIA, TAX Y ASESORIA SA');
  });

  it('parseClientsCsv strips UTF-8 BOM', () => {
    const csv = fs.readFileSync(path.join(fixtureDir, 'contpaqi_clientes.example.csv'), 'utf8');
    const clients = parseClientsCsv(csv);
    // RFC on first row must not have BOM prefix
    expect(clients[0].rfc).toBe('TDM040101ABC');
  });

  it('parseProductsCsv reads numeric fields correctly', () => {
    const csv = fs.readFileSync(path.join(fixtureDir, 'contpaqi_productos.example.csv'), 'utf8');
    const products = parseProductsCsv(csv);
    expect(products).toHaveLength(2);
    expect(products[0]).toEqual({
      sku: 'TOR-MAI-KG',
      nombre: 'Tortilla de maiz',
      unidad: 'kg',
      precio: 18.0,
      claveSAT: '50161509',
      ivaTasa: 0.0
    });
  });

  it('parseProductsCsv reads second row', () => {
    const csv = fs.readFileSync(path.join(fixtureDir, 'contpaqi_productos.example.csv'), 'utf8');
    const products = parseProductsCsv(csv);
    expect(products[1].sku).toBe('TOR-HAR-KG');
    expect(products[1].precio).toBe(32.0);
  });

  it('parseFreshnessJson reads all fields', () => {
    const json = JSON.stringify({
      last_sync_at: '2026-08-18T21:15:00.000Z',
      status: 'ok',
      records: { clients: 342, products: 87 },
      duration_ms: 4321,
      agent_version: '0.1.0'
    });
    const freshness = parseFreshnessJson(json);
    expect(freshness.lastSyncAt).toBe('2026-08-18T21:15:00.000Z');
    expect(freshness.status).toBe('ok');
    expect(freshness.records.clients).toBe(342);
    expect(freshness.records.products).toBe(87);
    expect(freshness.durationMs).toBe(4321);
    expect(freshness.agentVersion).toBe('0.1.0');
  });

  it('parseFreshnessJson exposes error_message on error', () => {
    const json = JSON.stringify({
      last_sync_at: '2026-08-18T21:15:00.000Z',
      status: 'error',
      records: { clients: 0, products: 0 },
      duration_ms: 100,
      agent_version: '0.1.0',
      error_message: 'BD inaccesible'
    });
    const freshness = parseFreshnessJson(json);
    expect(freshness.error).toBe('BD inaccesible');
    expect(freshness.status).toBe('error');
  });

  it('parseFreshnessJson error field is undefined when status is ok', () => {
    const json = JSON.stringify({
      last_sync_at: '2026-08-18T21:15:00.000Z',
      status: 'ok',
      records: { clients: 10, products: 5 },
      duration_ms: 200,
      agent_version: '0.1.0'
    });
    const freshness = parseFreshnessJson(json);
    expect(freshness.error).toBeUndefined();
  });
});
