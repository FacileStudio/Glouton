import { browser } from '$app/environment';

export type TeamContext =
  | { type: 'personal' }
  | { type: 'team'; teamId: string; name: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' };

const STORAGE_KEY = 'glouton-team-context';

function loadFromStorage(): TeamContext {
  if (!browser) return { type: 'personal' };

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as TeamContext;
      if (parsed.type === 'personal' || (parsed.type === 'team' && parsed.teamId && parsed.name && parsed.role)) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Failed to load team context from localStorage:', error);
  }

  return { type: 'personal' };
}

function saveToStorage(context: TeamContext): void {
  if (!browser) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
  } catch (error) {
    console.error('Failed to save team context to localStorage:', error);
  }
}

class TeamContextStore {
  private _context = $state<TeamContext>(loadFromStorage());

  get context(): TeamContext {
    return this._context;
  }

  setPersonal(): void {
    const newContext: TeamContext = { type: 'personal' };
    this._context = newContext;
    saveToStorage(newContext);
  }

  setTeam(teamId: string, name: string, role: 'OWNER' | 'ADMIN' | 'MEMBER'): void {
    const newContext: TeamContext = { type: 'team', teamId, name, role };
    this._context = newContext;
    saveToStorage(newContext);
  }

  getTeamId(): string | undefined {
    return this._context.type === 'team' ? this._context.teamId : undefined;
  }

  isPersonal(): boolean {
    return this._context.type === 'personal';
  }

  canManageTeam(): boolean {
    return this._context.type === 'team' && (this._context.role === 'OWNER' || this._context.role === 'ADMIN');
  }

  getRole(): 'OWNER' | 'ADMIN' | 'MEMBER' | undefined {
    return this._context.type === 'team' ? this._context.role : undefined;
  }

  getName(): string {
    return this._context.type === 'team' ? this._context.name : 'Personnel';
  }
}

export const teamContextStore = new TeamContextStore();
