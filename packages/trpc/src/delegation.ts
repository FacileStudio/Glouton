import type { SessionUser } from '@repo/auth-shared';

export const READ_SCOPE = 'glouton.read';
export const WRITE_SCOPE = 'glouton.write';

/** A caller acting for a user through a Registre token-exchange (delegated) token. */
export interface DelegatedPrincipal {
  user: SessionUser;
  actor: string;
  subject: string;
  scopes: string[];
}

export type DelegatedVerifier = (token: string) => Promise<DelegatedPrincipal | null>;

/** The delegated scope an HTTP method needs: reads for safe methods, writes for the rest. */
export function requiredScope(method: string): typeof READ_SCOPE | typeof WRITE_SCOPE {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? READ_SCOPE : WRITE_SCOPE;
}

/** True when a delegated caller holds the scope; human sessions carry no scope list and always pass. */
export function hasScope(scopes: string[] | null, needed: string): boolean {
  return scopes === null || scopes.includes(needed);
}
