import { onMount, onDestroy } from 'svelte';
import { ws } from '$lib/websocket';
import { toast } from '@repo/utils';

interface HuntSession {
  id: string;
  targetUrl: string;
  huntType?: 'DOMAIN' | 'LOCAL_BUSINESS';
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
}

export function useHuntWebSocket(
  getHuntSessions: () => HuntSession[],
  setHuntSessions: (sessions: HuntSession[]) => void,
  onStatsChange: () => Promise<void>,
  onDataChange: () => Promise<void>
) {
  const unsubscribers: Array<() => void> = [];

  function setupWebSocketListeners() {
    const updateSession = (huntSessionId: string, updates: Partial<HuntSession>) => {
      const current = getHuntSessions();
      const index = current.findIndex((s) => s.id === huntSessionId);
      if (index !== -1) {
        const updated = [...current];
        updated[index] = { ...updated[index], ...updates };
        setHuntSessions(updated);
        return true;
      }
      return false;
    };

    unsubscribers.push(
      ws.on('hunt-started', (data) => {
        console.log('[WS] Hunt started:', data);
        const current = getHuntSessions();
        const existingIndex = current.findIndex((s) => s.id === data.huntSessionId);

        if (existingIndex === -1) {
          const newSession: HuntSession = {
            id: data.huntSessionId,
            targetUrl: data.targetUrl || data.location || 'Hunt',
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
          setHuntSessions([newSession, ...current]);
        } else {
          updateSession(data.huntSessionId, {
            status: 'PENDING',
            startedAt: null,
          });
        }

        const huntType = data.huntType === 'LOCAL_BUSINESS' ? 'Local business' : 'Domain';
        toast.push(`${huntType} hunt started`, 'info');
      })
    );

    unsubscribers.push(
      ws.on('hunt-processing', (data) => {
        console.log('[WS] Hunt processing:', data);
        updateSession(data.huntSessionId, {
          status: 'PROCESSING',
          startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
        });
      })
    );

    unsubscribers.push(
      ws.on('hunt-progress', (data) => {
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
      ws.on('hunt-update', (data) => {
        updateSession(data.huntSessionId, {
          progress: data.progress,
          totalLeads: data.totalLeads,
          successfulLeads: data.successfulLeads,
          status: data.status,
        });
      })
    );

    unsubscribers.push(
      ws.on('hunt-completed', async (data) => {
        console.log('[WS] Hunt completed:', data);
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

          await onDataChange();
          await onStatsChange();
        }
      })
    );

    unsubscribers.push(
      ws.on('hunt-failed', (data) => {
        console.log('[WS] Hunt failed:', data);
        updateSession(data.huntSessionId, {
          status: 'FAILED',
          error: data.error || 'Unknown error',
          completedAt: new Date(),
        });
        toast.push(`Hunt failed: ${data.error || 'Unknown error'}`, 'error');
      })
    );

    unsubscribers.push(
      ws.on('hunt-cancelled', (data) => {
        console.log('[WS] Hunt cancelled:', data);
        const current = getHuntSessions();
        const session = current.find((s) => s.id === data.huntSessionId);

        if (session?.status === 'PENDING' || session?.status === 'PROCESSING') {
          updateSession(data.huntSessionId, {
            status: 'CANCELLED',
            completedAt: new Date(),
          });
          toast.push('Hunt cancelled', 'info');
        }
      })
    );

    unsubscribers.push(
      ws.on('local-business-hunt-progress', (data) => {
        console.log('[WS] Local business hunt progress:', data);
        updateSession(data.huntSessionId, {
          status: 'PROCESSING',
          progress: data.progress || 0,
          totalLeads: data.totalLeads || 0,
          successfulLeads: data.successfulLeads || 0,
        });
      })
    );

    unsubscribers.push(
      ws.on('stats-changed', async () => {
        await onStatsChange();
      })
    );

    unsubscribers.push(
      ws.on('leads-added', async (data) => {
        if (data.huntSessionId) {
          console.log('[WS] Leads added for hunt:', data);
          const sessions = getHuntSessions();
          const session = sessions.find(s => s.id === data.huntSessionId);
          if (session) {
            updateSession(data.huntSessionId, {
              successfulLeads: (session.successfulLeads || 0) + (data.count || 0),
              totalLeads: (session.totalLeads || 0) + (data.count || 0),
            });
          }
        }
      })
    );
  }

  onMount(() => {
    setupWebSocketListeners();
  });

  onDestroy(() => {
    unsubscribers.forEach((unsub) => unsub());
  });
}