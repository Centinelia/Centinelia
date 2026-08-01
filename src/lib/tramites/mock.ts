import { readFile } from 'fs/promises';
import path from 'path';

export function isMockMode(): boolean {
  return process.env.EXTERNAL_TRAMITES_MOCK_MODE === 'true';
}

export async function loadFixture(
  slug: string,
  kind: 'catalogos' | 'lookups' | 'submit',
  name: string,
): Promise<unknown | null> {
  try {
    const filePath = path.join(process.cwd(), 'fixtures', 'tramites', slug, kind, `${name}.json`);
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
