import type { SQL } from 'bun';
import type { QueueManager } from '@repo/jobs';

export async function checkOrphanedSessions(db: SQL, jobs: QueueManager) {
  // Check audit sessions older than 5 minutes without jobId
  const orphanedAudits = await db`
    UPDATE "AuditSession"
    SET status = 'FAILED',
        error = 'Session orphaned',
        "completedAt" = NOW()
    WHERE status IN ('PENDING', 'PROCESSING')
      AND "jobId" IS NULL
      AND "createdAt" < NOW() - INTERVAL '5 minutes'
    RETURNING id
  `;

  // Check hunt sessions older than 5 minutes without jobId
  const orphanedHunts = await db`
    UPDATE "HuntSession"
    SET status = 'FAILED',
        error = 'Session orphaned',
        "completedAt" = NOW()
    WHERE status IN ('PENDING', 'PROCESSING')
      AND "jobId" IS NULL
      AND "createdAt" < NOW() - INTERVAL '5 minutes'
    RETURNING id
  `;

  return {
    audits: orphanedAudits.length,
    hunts: orphanedHunts.length,
  };
}

export async function syncJobState(
  db: SQL,
  jobs: QueueManager,
  sessionType: 'audit' | 'hunt',
  sessionId: string,
  jobId: string
): Promise<boolean> {
  const job = await jobs.getJob('leads', jobId);
  if (!job) {
    // Job doesn't exist, mark session as failed
    if (sessionType === 'audit') {
      await db`
        UPDATE "AuditSession"
        SET status = 'FAILED',
            error = 'Job not found',
            "completedAt" = NOW()
        WHERE id = ${sessionId}
      `;
    } else {
      await db`
        UPDATE "HuntSession"
        SET status = 'FAILED',
            error = 'Job not found',
            "completedAt" = NOW()
        WHERE id = ${sessionId}
      `;
    }
    return false;
  }

  const state = await job.getState();

  if (state === 'completed' || state === 'failed') {
    const status = state === 'completed' ? 'COMPLETED' : 'FAILED';
    const error = state === 'failed' ? job.failedReason : null;

    if (sessionType === 'audit') {
      await db`
        UPDATE "AuditSession"
        SET status = ${status},
            error = ${error},
            "completedAt" = NOW()
        WHERE id = ${sessionId}
      `;
    } else {
      await db`
        UPDATE "HuntSession"
        SET status = ${status},
            error = ${error},
            "completedAt" = NOW()
        WHERE id = ${sessionId}
      `;
    }
    return true;
  }

  return false;
}

export async function cleanupStalled(db: SQL) {
  // Mark sessions that haven't updated in 30 minutes as failed
  const stalledAudits = await db`
    UPDATE "AuditSession"
    SET status = 'FAILED',
        error = 'Session stalled',
        "completedAt" = NOW()
    WHERE status = 'PROCESSING'
      AND "updatedAt" < NOW() - INTERVAL '30 minutes'
    RETURNING id
  `;

  const stalledHunts = await db`
    UPDATE "HuntSession"
    SET status = 'FAILED',
        error = 'Session stalled',
        "completedAt" = NOW()
    WHERE status = 'PROCESSING'
      AND "updatedAt" < NOW() - INTERVAL '30 minutes'
    RETURNING id
  `;

  return {
    audits: stalledAudits.length,
    hunts: stalledHunts.length,
  };
}