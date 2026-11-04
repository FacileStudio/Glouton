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
  readable: boolean;
}

const registry = new Map<string, Entry>();

/** True for a schema the gate can run (zod). */
function isParser(value: unknown): value is SafeParser {
  return typeof (value as Partial<SafeParser> | null)?.safeParseAsync === 'function';
}

/**
 * The top-level keys of a zod object schema, looking through optional,
 * nullable, default and refine wrappers, or null when the schema is anything
 * else (union, intersection, array, a primitive) and its keys cannot be read.
 */
export function shapeKeys(schema: unknown): string[] | null {
  let current = schema as { shape?: Record<string, unknown>; _def?: Record<string, unknown> } | undefined;
  for (let depth = 0; current && depth < 10; depth++) {
    if (current.shape && typeof current.shape === 'object') return Object.keys(current.shape);
    const def = current._def;
    current = (def?.innerType ?? def?.schema) as typeof current;
  }
  return null;
}

/** Registers every procedure of the app router; called once where the router is built. */
export function bindProcedures(procedures: object, isIdKey: (key: string) => boolean): void {
  registry.clear();
  for (const [path, procedure] of Object.entries(procedures as Record<string, ProcedureLike>)) {
    const inputs = procedure._def.inputs;
    const parsers = inputs.filter(isParser);
    const shapes = parsers.map((parser) => shapeKeys(parser));
    const readable = parsers.length === inputs.length && shapes.every((keys) => keys !== null);
    const idKeys = shapes.flatMap((keys) => keys ?? []).filter(isIdKey);
    registry.set(path, { parsers, idKeys, readable });
  }
}

/** The id-like keys a registered procedure's input declares. */
export function idKeysOf(path: string): string[] {
  return registry.get(path)?.idKeys ?? [];
}

/**
 * False when a registered procedure's input schema is not a (wrapped) object
 * the gate can read, so its ids and team cannot be checked. Unknown paths
 * read as readable: they have no schema, so the gate sees no input at all.
 */
export function isReadable(path: string): boolean {
  return registry.get(path)?.readable ?? true;
}

/** Every registered path with its id-like keys and readability, for the audit test. */
export function registeredProcedures(): Array<{ path: string; idKeys: string[]; readable: boolean }> {
  return Array.from(registry.entries()).map(([path, entry]) => ({ path, idKeys: entry.idKeys, readable: entry.readable }));
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
