import { ws } from '$lib/websocket';
import { toast } from '@repo/utils';

type EventCallback = (data: any) => void;
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

  private emit(event: string, data: any) {
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

export interface HuntSession {
  id: string;
  huntType: 'DOMAIN' | 'LOCAL_BUSINESS' | undefined;
  speed: number;
  progress: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalLeads: number;
  successfulLeads: number;
  failedLeads: number;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  filters?: any;
  lastDiscoveredDomain?: string | null;
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
    wsEvents.on('audit-started', (data) => {
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

      toast.push('Audit started', 'info');
    })
  );

  unsubscribers.push(
    wsEvents.on('audit-progress', (data) => {
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
    wsEvents.on('audit-completed', async (data) => {
      const found = updateSession(data.auditSessionId, {
        status: 'COMPLETED',
        progress: 100,
        processedLeads: data.processedLeads || 0,
        updatedLeads: data.updatedLeads || 0,
        failedLeads: data.failedLeads || 0,
        completedAt: new Date(),
      });

      if (found) {
        toast.push(`Audit completed! ${data.updatedLeads || 0} leads updated`, 'success');
        if (onDataChange) await onDataChange();
      }
    })
  );

  unsubscribers.push(
    wsEvents.on('audit-failed', (data) => {
      updateSession(data.auditSessionId, {
        status: 'FAILED',
        error: data.error || 'Unknown error',
        completedAt: new Date(),
      });
      toast.push('Audit failed: ' + (data.error || 'Unknown error'), 'error');
    })
  );

  unsubscribers.push(
    wsEvents.on('audit-cancelled', (data) => {
      updateSession(data.auditSessionId, {
        status: 'CANCELLED',
        completedAt: new Date(),
      });
      toast.push('Audit cancelled', 'info');
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
    wsEvents.on('hunt-started', (data) => {
      const newSession: HuntSession = {
        id: data.huntSessionId,
        huntType: data.huntType,
        speed: data.speed || 1,
        status: 'PENDING',
        progress: 0,
        totalLeads: 0,
        successfulLeads: 0,
        failedLeads: 0,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        filters: data.filters,
      };

      if (!updateSession(data.huntSessionId, {
        status: 'PENDING',
        startedAt: null,
      })) {
        addSession(newSession);
      }

      const huntType = data.huntType === 'LOCAL_BUSINESS' ? 'Local business' : 'Domain';
      toast.push(`${huntType} hunt started`, 'info');
    })
  );

  unsubscribers.push(
    wsEvents.on('hunt-processing', (data) => {
      updateSession(data.huntSessionId, {
        status: 'PROCESSING',
        startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
      });
    })
  );

  unsubscribers.push(
    wsEvents.on('hunt-progress', (data) => {
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
    wsEvents.on('hunt-update', (data) => {
      updateSession(data.huntSessionId, {
        progress: data.progress,
        totalLeads: data.totalLeads,
        successfulLeads: data.successfulLeads,
        status: data.status,
      });
    })
  );

  unsubscribers.push(
    wsEvents.on('local-business-hunt-progress', (data) => {
      updateSession(data.huntSessionId, {
        status: 'PROCESSING',
        progress: data.progress || 0,
        totalLeads: data.totalLeads || 0,
        successfulLeads: data.successfulLeads || 0,
      });
    })
  );

  unsubscribers.push(
    wsEvents.on('hunt-completed', async (data) => {
      const found = updateSession(data.huntSessionId, {
        status: 'COMPLETED',
        progress: 100,
        totalLeads: data.totalLeads || 0,
        successfulLeads: data.successfulLeads || 0,
        failedLeads: data.failedLeads || 0,
        completedAt: new Date(),
      });

      if (found) {
        const successCount = data.successfulLeads || 0;
        const failCount = data.failedLeads || 0;
        const message = failCount > 0
          ? `Hunt completed! Found ${successCount} leads (${failCount} failed)`
          : `Hunt completed! Found ${successCount} leads`;
        toast.push(message, 'success');

        if (onDataChange) await onDataChange();
        if (onStatsChange) await onStatsChange();
      }
    })
  );

  unsubscribers.push(
    wsEvents.on('hunt-failed', (data) => {
      updateSession(data.huntSessionId, {
        status: 'FAILED',
        error: data.error || 'Unknown error',
        completedAt: new Date(),
      });
      toast.push(`Hunt failed: ${data.error || 'Unknown error'}`, 'error');
    })
  );

  unsubscribers.push(
    wsEvents.on('hunt-cancelled', (data) => {
      updateSession(data.huntSessionId, {
        status: 'CANCELLED',
        completedAt: new Date(),
      });
      toast.push('Hunt cancelled', 'info');
    })
  );

  unsubscribers.push(
    wsEvents.on('leads-added', (data) => {
      if (data.huntSessionId) {
        updateSession(data.huntSessionId, {
          successfulLeads: data.newSuccessfulLeads,
          totalLeads: data.newTotalLeads,
        });
      }
    })
  );

  unsubscribers.push(
    wsEvents.on('domain-discovered', (data) => {
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
    wsEvents.on('businesses-discovered', (data) => {
      if (data.huntSessionId) {
        updateSession(data.huntSessionId, {
          totalLeads: data.count,
        });
        const message = `Found ${data.count} businesses in ${data.location}`;
        toast.push(message, 'info');
      }
    })
  );

  unsubscribers.push(
    wsEvents.on('leads-created', (data) => {
      if (data.huntSessionId) {
        // Don't override the counts here as they're cumulative in the hunt-progress event
        // Just show a notification for the new leads
        toast.push(data.message || `${data.count} new leads created`, 'success');
      }
    })
  );

  unsubscribers.push(
    wsEvents.on('leads-updated', (data) => {
      if (data.huntSessionId) {
        toast.push(data.message || `${data.count} leads updated`, 'info');
      }
    })
  );

  unsubscribers.push(
    wsEvents.on('hunt-error', (data) => {
      if (data.huntSessionId) {
        updateSession(data.huntSessionId, {
          error: data.error,
        });
        toast.push(`Hunt error: ${data.error}`, 'error');
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