import type { AuthState, SessionUser } from './';
import Cookies from 'js-cookie';
import { logger } from '@repo/logger';

type Listener<AuthState> = (value: AuthState) => void;

export interface StorageProvider {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

export class UniversalAuthStore {
  private state: AuthState;
  private listeners = new Set<Listener<AuthState>>();
  private storage: StorageProvider;
  private key = 'auth-storage';
  private cookieName = 'auth_token';
  private onSignOut?: () => Promise<any>;

  /**
   * constructor
   */
  constructor(initialState: AuthState, storage: StorageProvider, onSignOut?: () => Promise<any>) {
    this.state = initialState;
    this.storage = storage;
    this.onSignOut = onSignOut;
  }

  /**
   * subscribe
   */
  subscribe(listener: Listener<AuthState>) {
    this.listeners.add(listener);
    /**
     * listener
     */
    listener(this.state);
    /**
     * return
     */
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * init
   */
  async init() {
    try {
      const saved = await this.storage.getItem(this.key);
      /**
       * if
       */
      if (saved) {
        this.state = { ...JSON.parse(saved), loading: false };
      } else {
        this.state = { ...this.state, loading: false };
      }
    } catch (e) {
      logger.error({ err: e }, 'AuthStore Init Error');
      this.state = { user: null, session: null, loading: false };
    } finally {
      this.notify();
    }
  }

  /**
   * update
   */
  update(patch: Partial<AuthState>) {
    this.state = { ...this.state, ...patch };

    /**
     * if
     */
    if (this.state.session) {
      const dataToSave = JSON.stringify({
        user: this.state.user,
        session: this.state.session,
      });
      this.storage.setItem(this.key, dataToSave);
    } else if (!this.state.loading) {
      this.storage.removeItem(this.key);
    }

    this.notify();
  }

  /**
   * setAuth
   */
  setAuth(session: { token: string }, user: SessionUser) {
    /**
     * if
     */
    if (typeof document !== 'undefined') {
      Cookies.set(this.cookieName, session.token, {
        expires: 7,
        path: '/',
        sameSite: 'strict',
        secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
      });
    }

    this.update({ session, user: user as SessionUser, loading: false });
  }

  /**
   * logout
   */
  async logout() {
    /**
     * if
     */
    if (this.onSignOut) {
      try {
        await this.onSignOut();
      } catch (e) {
        logger.error({ err: e }, 'Server signOut failed');
      }
    }
    await this.clear();
  }

  /**
   * clear
   */
  async clear() {
    this.state = { user: null, session: null, loading: false };

    await this.storage.removeItem(this.key);

    /**
     * if
     */
    if (typeof document !== 'undefined') {
      Cookies.remove(this.cookieName, { path: '/' });
    }

    this.notify();
  }

  /**
   * updateUser
   */
  updateUser(user: SessionUser) {
    this.update({ user });
  }

  /**
   * getState
   */
  getState() {
    return this.state;
  }

  /**
   * notify
   */
  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }
}
