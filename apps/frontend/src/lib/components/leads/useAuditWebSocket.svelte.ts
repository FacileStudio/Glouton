import { onMount, onDestroy } from 'svelte';
import { ws } from '$lib/websocket';
import { toast } from '@repo/utils';

export function useAuditWebSocket(
  getAuditSessions: () => AuditSession[],
  setAuditSessions: (sessions: AuditSession[]) => void,
  onStatsChange: () => Promise<void>,
  onDataChange: () => Promise<void>
) {
  const unsubscribers: Array<() => void> = [];

  function setupWebSocketListeners() {
    // Helper to update a single session in the list
    const updateSession = (auditSessionId: string, updates: Partial<AuditSession>) => {
      const current = getAuditSessions();
      const index = current.findIndex((s) => s.id === auditSessionId);
      if (index !== -1) {
        const updated = [...current];
        updated[index] = { ...updated[index], ...updates };
        setAuditSessions(updated);
        return true;
      }
      return false;
    };

    // Listen for audit started
    unsubscribers.push(
      ws.on('audit-started', (data) => {
        console.log('[WS] Audit started:', data);
        const current = getAuditSessions();
        const existingIndex = current.findIndex((s) => s.id === data.auditSessionId);

        if (existingIndex === -1) {
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
          setAuditSessions([newSession, ...current]);
        } else {
          updateSession(data.auditSessionId, {
            status: data.status || 'PENDING',
            startedAt: new Date()
          });
        }
        toast.push('Audit started', 'info');
      })
    );

    // Listen for audit progress
    unsubscribers.push(
      ws.on('audit-progress', (data) => {
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

    // Listen for audit completion
    unsubscribers.push(
      ws.on('audit-completed', async (data) => {
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
          await onDataChange();
        }
      })
    );

    // Listen for audit failure
    unsubscribers.push(
      ws.on('audit-failed', (data) => {
        updateSession(data.auditSessionId, {
          status: 'FAILED',
          error: data.error || 'Unknown error',
          completedAt: new Date(),
        });
        toast.push('Audit failed: ' + (data.error || 'Unknown error'), 'error');
      })
    );

    // Listen for audit cancellation
    unsubscribers.push(
      ws.on('audit-cancelled', (data) => {
        const current = getAuditSessions();
        setAuditSessions(current.filter((s) => s.id !== data.auditSessionId));
        toast.push('Audit cancelled', 'info');
      })
    );

    // Listen for stats changes
    unsubscribers.push(
      ws.on('stats-changed', async () => {
        await onStatsChange();
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
