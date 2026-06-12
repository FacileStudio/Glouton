export type MapsErrorCode =
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'NETWORK'
  | 'GEOCODING_FAILED'
  | 'INVALID_RESPONSE';

/**
 * Clean, user-facing French messages for the hunt live feed ("Flux en direct").
 * Technical details stay in `message` (logs only).
 */
export const MAPS_ERROR_MESSAGES: Record<MapsErrorCode, string> = {
  RATE_LIMITED:
    'Le service de cartographie est temporairement saturé. Réessayez dans quelques minutes.',
  TIMEOUT:
    'La recherche a pris trop de temps. Réduisez le rayon de recherche ou réessayez plus tard.',
  UNAVAILABLE:
    'Le service OpenStreetMap est momentanément indisponible. Réessayez dans quelques minutes.',
  NETWORK:
    'Impossible de joindre le service de cartographie. Réessayez dans quelques minutes.',
  GEOCODING_FAILED:
    'Localisation introuvable. Vérifiez le nom de la ville et réessayez.',
  INVALID_RESPONSE:
    'Le service de cartographie a renvoyé une réponse inattendue. Réessayez plus tard.',
};

export class MapsError extends Error {
  readonly code: MapsErrorCode;
  /** Message propre destiné à l'UI. */
  readonly userMessage: string;

  constructor(code: MapsErrorCode, technicalMessage: string, userMessage?: string) {
    super(technicalMessage);
    this.name = 'MapsError';
    this.code = code;
    this.userMessage = userMessage ?? MAPS_ERROR_MESSAGES[code];
  }
}

/** Classify an arbitrary error into a MapsError (idempotent). */
export function toMapsError(error: unknown): MapsError {
  if (error instanceof MapsError) return error;

  const message = error instanceof Error ? error.message : 'Unknown error';

  if (/unable to connect|failed to fetch|fetch failed|econnrefused|econnreset|enotfound|network|socket/i.test(message)) {
    return new MapsError('NETWORK', message);
  }
  if (/timeout|timed out|504/i.test(message)) {
    return new MapsError('TIMEOUT', message);
  }
  if (/429|rate.?limit/i.test(message)) {
    return new MapsError('RATE_LIMITED', message);
  }
  return new MapsError('UNAVAILABLE', message);
}
