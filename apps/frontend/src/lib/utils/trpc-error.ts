function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Returns the error's message, or the fallback when the error carries none.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Returns the tRPC error code (for example `UNAUTHORIZED`) carried by a client error.
 */
export function getErrorCode(error: unknown): string | undefined {
  const code = asRecord(asRecord(error)?.data)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Extracts a user-facing message from a tRPC error, unwrapping zod validation details.
 */
export function getTrpcErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  const record = asRecord(error);
  const message = record?.message;
  if (typeof message === 'string' && message) {
    try {
      const parsed: unknown = JSON.parse(message);
      const first = Array.isArray(parsed) ? asRecord(parsed[0]) : null;
      if (typeof first?.message === 'string') return first.message;
    } catch {
      return message;
    }
  }

  const fieldErrors = asRecord(asRecord(asRecord(record?.data)?.zodError)?.fieldErrors);
  if (fieldErrors) {
    const firstField = Object.values(fieldErrors)[0];
    return Array.isArray(firstField) && typeof firstField[0] === 'string' ? firstField[0] : 'Validation error';
  }

  const shapeMessage = asRecord(record?.shape)?.message;
  if (typeof shapeMessage === 'string') return shapeMessage;

  return 'An unexpected error occurred';
}
