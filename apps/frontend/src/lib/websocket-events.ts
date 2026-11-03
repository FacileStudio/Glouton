import { ws } from '$lib/websocket';
import { toast } from '@facile/muse';
import type { RouterOutputs } from '@repo/trpc-client';

export type HuntFilters = NonNullable<RouterOutputs['lead']['hunt']['getRunDetails']['filters']>;

type HuntStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface WsEventPayload {
  huntSessionId?: string;
  auditSessionId?: string;
  huntType?: 'DOMAIN' | 'LOCAL_BUSINESS';
  status?: HuntStatus;
  filters?: HuntFilters;
  message?: string;
  error?: string;
  source?: string;
  currentSource?: string;
  domain?: string;
  organization?: string;
  industry?: string;
  location?: string;
  startedAt?: string;
  count?: number;
  progress?: number;
  totalLeads?: number;
  successfulLeads?: number;
  failedLeads?: number;
  updatedLeads?: number;
  processedLeads?: number;
  totalDiscovered?: number;
  totalSources?: number;
  sourcesCompleted?: number;
  newTotalLeads?: number;
  newSuccessfulLeads?: number;
  leadsFound?: number;
}

type EventCallback = (data: WsEventPayload) => void;
type EventUnsubscriber = () => void;

interface EventSubscription {
  event: string;
  callback: EventCallback;
  unsubscriber?: EventUnsubscriber;
}

class WebSocketEventManager {
  private subscriptions: Map<string, Set<EventSubscription>> = new Map();
  private globalSubscriptions: Map<string, EventUnsubscriber> = new Map();
  private isInitialized = false;

  constructor() {
    this.setupGlobalListeners();
  }

  private setupGlobalListeners() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const events = [
      'audit-started',
      'audit-progress',
      'audit-completed',
      'audit-failed',
      'audit-cancelled',
      'hunt-started',
      'hunt-processing',
      'hunt-progress',
      'hunt-update',
      'hunt-completed',
      'hunt-failed',
      'hunt-cancelled',
      'hunt-error',
      'domain-discovered',
      'businesses-discovered',
      'leads-created',
      'leads-updated',
      'local-business-hunt-progress',
      'leads-added',
      'stats-changed',
      'extraction-progress',
      'extraction-completed',
      'extraction-failed',
      'extraction-cancelled',
    ];

    events.forEach(event => {
      const unsubscriber = ws.on(event, (data) => {
        this.emit(event, data);
      });
      this.globalSubscriptions.set(event, unsubscriber);
    });
  }

  private emit(event: string, data: WsEventPayload) {
    const subscriptions = this.subscriptions.get(event);
    if (subscriptions) {
      subscriptions.forEach(sub => {
        try {
          sub.callback(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  on(event: string, callback: EventCallback): EventUnsubscriber {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }

    const subscription: EventSubscription = { event, callback };
    this.subscriptions.get(event)!.add(subscription);

    return () => {
      const subs = this.subscriptions.get(event);
      if (subs) {
        subs.delete(subscription);
        if (subs.size === 0) {
          this.subscriptions.delete(event);
        }
      }
    };
  }

  destroy() {
    this.subscriptions.clear();
    this.globalSubscriptions.forEach(unsub => unsub());
    this.globalSubscriptions.clear();
  }
}

export const wsEvents = new WebSocketEventManager();

export interface AuditSession {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  totalLeads: number;
  processedLeads: number;
  updatedLeads: number;
  failedLeads: number;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export type HuntSession = RouterOutputs['lead']['hunt']['list'][number] & {
  lastDiscoveredDomain?: string | null;
};

type SessionKey = 'huntSessionId' | 'auditSessionId';

function hasSessionId<K extends SessionKey>(data: WsEventPayload, key: K): data is WsEventPayload & Record<K, string> {
  return typeof data[key] === 'string';
}

function onSessionEvent<K extends SessionKey>(
  key: K,
  event: string,
  callback: (data: WsEventPayload & Record<K, string>) => void
): EventUnsubscriber {
  return wsEvents.on(event, (data) => {
    if (hasSessionId(data, key)) callback(data);
  });
}

export function setupAuditListeners(
  updateSession: (id: string, updates: Partial<AuditSession>) => boolean,
  addSession: (session: AuditSession) => void,
  removeSession: (id: string) => void,
  onDataChange?: () => Promise<void>,
  onStatsChange?: () => Promise<void>
): EventUnsubscriber[] {
  const unsubscribers: EventUnsubscriber[] = [];

  unsubscribers.push(
    onSessionEvent('auditSessionId', 'audit-started', (data) => {
      const newSession: AuditSession = {
        id: data.auditSessionId,
        status: data.status || 'PENDING',
        progress: data.progress || 0,
        totalLeads: data.totalLeads || 0,
        processedLeads: data.processedLeads || 0,
        updatedLeads: data.updatedLeads || 0,
        failedLeads: data.failedLeads || 0,
        error: null,
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
      };

      if (!updateSession(data.auditSessionId, {
        status: data.status || 'PENDING',
        startedAt: new Date()
      })) {
        addSession(newSession);
      }

      toast.info('Audit started');
    })
  );

  unsubscribers.push(
    onSessionEvent('auditSessionId', 'audit-progress', (data) => {
      updateSession(data.auditSessionId, {
        status: data.status || 'PROCESSING',
        progress: data.progress || 0,
        processedLeads: data.processedLeads || 0,
        updatedLeads: data.updatedLeads || 0,
        failedLeads: data.failedLeads || 0,
        totalLeads: data.totalLeads || 0,
      });
    })
  );

  unsubscribers.push(
    onSessionEvent('auditSessionId', 'audit-completed', async (data) => {
      const found = updateSession(data.auditSessionId, {
        status: 'COMPLETED',
        progress: 100,
        processedLeads: data.processedLeads || 0,
        updatedLeads: data.updatedLeads || 0,
        failedLeads: data.failedLeads || 0,
        completedAt: new Date(),
      });

      if (found) {
        toast.success(`Audit completed! ${data.updatedLeads || 0} leads updated`);
        if (onDataChange) await onDataChange();
      }
    })
  );

  unsubscribers.push(
    onSessionEvent('auditSessionId', 'audit-failed', (data) => {
      updateSession(data.auditSessionId, {
        status: 'FAILED',
        error: data.error || 'Unknown error',
        completedAt: new Date(),
      });
      toast.danger('Audit failed: ' + (data.error || 'Unknown error'));
    })
  );

  unsubscribers.push(
    onSessionEvent('auditSessionId', 'audit-cancelled', (data) => {
      updateSession(data.auditSessionId, {
        status: 'CANCELLED',
        completedAt: new Date(),
      });
      toast.info('Audit cancelled');
    })
  );

  if (onStatsChange) {
    unsubscribers.push(
      wsEvents.on('stats-changed', async () => {
        await onStatsChange();
      })
    );
  }

  return unsubscribers;
}

export function setupHuntListeners(
  updateSession: (id: string, updates: Partial<HuntSession>) => boolean,
  addSession: (session: HuntSession) => void,
  onDataChange?: () => Promise<void>,
  onStatsChange?: () => Promise<void>
): EventUnsubscriber[] {
  const unsubscribers: EventUnsubscriber[] = [];

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-started', (data) => {
      const newSession: HuntSession = {
        id: data.huntSessionId,
        huntType: data.huntType ?? 'DOMAIN',
        status: 'PENDING',
        progress: 0,
        totalLeads: 0,
        successfulLeads: 0,
        failedLeads: 0,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        filters: data.filters ?? null,
      };

      if (!updateSession(data.huntSessionId, {
        status: 'PENDING',
        startedAt: null,
      })) {
        addSession(newSession);
      }

      const huntType = data.huntType === 'LOCAL_BUSINESS' ? 'Local business' : 'Domain';
      toast.info(`${huntType} hunt started`);
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-processing', (data) => {
      updateSession(data.huntSessionId, {
        status: 'PROCESSING',
        startedAt: data.startedAt ?? new Date().toISOString(),
      });
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-progress', (data) => {
      updateSession(data.huntSessionId, {
        status: 'PROCESSING',
        progress: data.progress || 0,
        totalLeads: data.totalLeads || 0,
        successfulLeads: data.successfulLeads || 0,
        failedLeads: data.failedLeads || 0,
      });
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-update', (data) => {
      updateSession(data.huntSessionId, {
        progress: data.progress,
        totalLeads: data.totalLeads,
        successfulLeads: data.successfulLeads,
        status: data.status,
      });
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'local-business-hunt-progress', (data) => {
      updateSession(data.huntSessionId, {
        status: 'PROCESSING',
        progress: data.progress || 0,
        totalLeads: data.totalLeads || 0,
        successfulLeads: data.successfulLeads || 0,
      });
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-completed', async (data) => {
      const found = updateSession(data.huntSessionId, {
        status: 'COMPLETED',
        progress: 100,
        totalLeads: data.totalLeads || 0,
        successfulLeads: data.successfulLeads || 0,
        failedLeads: data.failedLeads || 0,
        completedAt: new Date().toISOString(),
      });

      if (found) {
        const successCount = data.successfulLeads || 0;
        const failCount = data.failedLeads || 0;
        const message = failCount > 0
          ? `Hunt completed! Found ${successCount} leads (${failCount} failed)`
          : `Hunt completed! Found ${successCount} leads`;
        toast.success(message);

        if (onDataChange) await onDataChange();
        if (onStatsChange) await onStatsChange();
      }
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-failed', (data) => {
      updateSession(data.huntSessionId, {
        status: 'FAILED',
        error: data.error || 'Unknown error',
        completedAt: new Date().toISOString(),
      });
      toast.danger(`Hunt failed: ${data.error || 'Unknown error'}`);
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-cancelled', (data) => {
      updateSession(data.huntSessionId, {
        status: 'CANCELLED',
        completedAt: new Date().toISOString(),
      });
      toast.info('Hunt cancelled');
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'leads-added', (data) => {
      if (data.huntSessionId) {
        updateSession(data.huntSessionId, {
          successfulLeads: data.newSuccessfulLeads,
          totalLeads: data.newTotalLeads,
        });
      }
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'domain-discovered', (data) => {
      if (data.huntSessionId) {
        updateSession(data.huntSessionId, {
          successfulLeads: data.totalDiscovered,
          progress: data.progress || 0,
          lastDiscoveredDomain: data.domain,
        });
      }
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'businesses-discovered', (data) => {
      if (data.huntSessionId) {
        updateSession(data.huntSessionId, {
          totalLeads: data.count,
        });
        const message = `Found ${data.count} businesses in ${data.location}`;
        toast.info(message);
      }
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'leads-created', (data) => {
      if (data.huntSessionId) {
        toast.success(data.message || `${data.count} new leads created`);
      }
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'leads-updated', (data) => {
      if (data.huntSessionId) {
        toast.info(data.message || `${data.count} leads updated`);
      }
    })
  );

  unsubscribers.push(
    onSessionEvent('huntSessionId', 'hunt-error', (data) => {
      if (data.huntSessionId) {
        updateSession(data.huntSessionId, {
          error: data.error,
        });
        toast.danger(`Erreur de chasse : ${data.error}`);
      }
    })
  );

  if (onStatsChange) {
    unsubscribers.push(
      wsEvents.on('stats-changed', async () => {
        await onStatsChange();
      })
    );
  }

  return unsubscribers;
}
