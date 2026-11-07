import { readFileSync } from 'node:fs';

export function readVersion(
  path: URL = new URL('../../../../package.json', import.meta.url),
): string {
  return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version;
}
