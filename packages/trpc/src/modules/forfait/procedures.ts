/**
 * Lets the plan gate see each procedure's input as the procedure itself will
 * parse it. tRPC runs base middlewares before input parsing, so the gate
 * parses the raw input with the procedure's own schemas: keys the procedure
 * does not declare (a stray `teamId`) are stripped and never decide a scope.
 */

interface SafeParser {
  safeParseAsync(value: unknown): Promise<{ success: boolean; data?: unknown }>;
}

interface ProcedureLike {
  _def: { inputs: unknown[] };
}

interface Entry {
  parsers: SafeParser[];
  idKeys: string[];
}

const registry = new Map<string, Entry>();

/** True for a schema the gate can run (zod). */
function isParser(value: unknown): value is SafeParser {
  return typeof (value as Partial<SafeParser> | null)?.safeParseAsync === 'function';
}

/** The top-level keys of a zod object schema, looking through optional, nullable, default and refine wrappers. */
export function shapeKeys(schema: unknown): string[] {
  let current = schema as { shape?: Record<string, unknown>; _def?: Record<string, unknown> } | undefined;
  for (let depth = 0; current && depth < 10; depth++) {
    if (current.shape && typeof current.shape === 'object') return Object.keys(current.shape);
    const def = current._def;
    current = (def?.innerType ?? def?.schema) as typeof current;
  }
  return [];
}

/** Registers every procedure of the app router; called once where the router is built. */
export function bindProcedures(procedures: object, isIdKey: (key: string) => boolean): void {
  registry.clear();
  for (const [path, procedure] of Object.entries(procedures as Record<string, ProcedureLike>)) {
    const parsers = procedure._def.inputs.filter(isParser);
    const idKeys = parsers.flatMap((parser) => shapeKeys(parser)).filter(isIdKey);
    registry.set(path, { parsers, idKeys });
  }
}

/** The id-like keys a registered procedure's input declares. */
export function idKeysOf(path: string): string[] {
  return registry.get(path)?.idKeys ?? [];
}

/** Every registered path with its id-like keys, for the audit test. */
export function registeredProcedures(): Array<{ path: string; idKeys: string[] }> {
  return Array.from(registry.entries()).map(([path, entry]) => ({ path, idKeys: entry.idKeys }));
}

/**
 * The raw input parsed by the procedure's own schemas, merged as tRPC merges
 * chained inputs. Undefined for an unknown procedure, one without input, or
 * an input its schemas reject (the procedure then answers BAD_REQUEST itself).
 */
export async function parsedInput(path: string, raw: unknown): Promise<unknown> {
  const entry = registry.get(path);
  if (!entry || entry.parsers.length === 0) return undefined;
  let merged: unknown = undefined;
  for (const parser of entry.parsers) {
    const result = await parser.safeParseAsync(raw);
    if (!result.success) return undefined;
    const data = result.data;
    merged =
      merged && typeof merged === 'object' && data && typeof data === 'object'
        ? { ...(merged as object), ...(data as object) }
        : data;
  }
  return merged;
}
