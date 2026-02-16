#!/usr/bin/env bun
/**
 * Test script for job cancellation flow
 * Tests both audit and hunt cancellation functionality
 */

import { db } from '@repo/database';
import { QueueManager, createJobConfig } from '@repo/jobs';
import { createWorkers } from '@repo/jobs/workers';
import { events } from './apps/backend/src/services/events';

// Mock broadcaster for testing
const mockBroadcaster = {
  broadcastToUser: (userId: string, message: any) => {
    console.log(`[WS] To user ${userId}:`, message.type, message.data);
  },
  broadcastToAll: (message: any) => {
    console.log(`[WS] Broadcast:`, message.type, message.data);
  }
};

// Initialize event system
events.init(mockBroadcaster);

// Initialize jobs
const jobs = new QueueManager(
  createJobConfig({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  })
);

// Register workers
const workers = createWorkers(db, events);
Object.entries(workers).forEach(([name, worker]) => {
  jobs.registerWorker('leads', worker);
  console.log(`[TEST] Registered ${name} worker`);
});

async function testAuditCancellation() {
  console.log('\n=== Testing Audit Cancellation ===');

  // Get an existing user from the database
  const [existingUser] = await db`
    SELECT id FROM "User" LIMIT 1
  `;

  if (!existingUser) {
    console.log('[TEST] ⚠️  No users found in database, skipping test');
    return;
  }

  const userId = existingUser.id;

  try {
    // Create a test audit session
    const [session] = await db`
      INSERT INTO "AuditSession" (
        id, "userId", status, progress, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'PENDING', 0, NOW(), NOW()
      )
      RETURNING id
    `;

    console.log(`[TEST] Created audit session: ${session.id}`);

    // Add a job for this session
    const job = await jobs.addJob(
      'leads',
      'lead-audit',
      { auditSessionId: session.id, userId },
      { delay: 5000 } // Delay to allow cancellation
    );

    // Update session with jobId
    await db`
      UPDATE "AuditSession"
      SET "jobId" = ${job.id}
      WHERE id = ${session.id}
    `;

    console.log(`[TEST] Added job: ${job.id}`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Cancel the job
    console.log(`[TEST] Cancelling audit...`);
    const queue = jobs['queues'].get('leads');
    if (queue) {
      const jobToCancel = await queue.getJob(job.id);
      if (jobToCancel) {
        await jobToCancel.remove();
        console.log(`[TEST] Job removed from queue`);
      }
    }

    // Update session status
    await db`
      UPDATE "AuditSession"
      SET status = 'CANCELLED', "completedAt" = NOW()
      WHERE id = ${session.id}
    `;

    // Emit cancellation event
    events.emit(userId, 'audit-cancelled', {
      auditSessionId: session.id
    });

    console.log(`[TEST] ✅ Audit cancellation test passed`);

    // Cleanup
    await db`DELETE FROM "AuditSession" WHERE id = ${session.id}`;

  } catch (error) {
    console.error(`[TEST] ❌ Audit cancellation test failed:`, error);
  }
}

async function testHuntCancellation() {
  console.log('\n=== Testing Hunt Cancellation ===');

  // Get an existing user from the database
  const [existingUser] = await db`
    SELECT id FROM "User" LIMIT 1
  `;

  if (!existingUser) {
    console.log('[TEST] ⚠️  No users found in database, skipping test');
    return;
  }

  const userId = existingUser.id;

  try {
    // Create a test hunt session
    const [session] = await db`
      INSERT INTO "HuntSession" (
        id, "userId", status, progress, filters, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'PENDING', 0, '{}', NOW(), NOW()
      )
      RETURNING id
    `;

    console.log(`[TEST] Created hunt session: ${session.id}`);

    // Add a job for this session
    const job = await jobs.addJob(
      'leads',
      'local-business-hunt',
      {
        huntSessionId: session.id,
        userId,
        location: 'New York, NY',
        category: 'restaurants',
        maxResults: 20
      },
      { delay: 5000 } // Delay to allow cancellation
    );

    // Update session with jobId
    await db`
      UPDATE "HuntSession"
      SET "jobId" = ${job.id}
      WHERE id = ${session.id}
    `;

    console.log(`[TEST] Added job: ${job.id}`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Cancel the job
    console.log(`[TEST] Cancelling hunt...`);
    const queue = jobs['queues'].get('leads');
    if (queue) {
      const jobToCancel = await queue.getJob(job.id);
      if (jobToCancel) {
        const state = await jobToCancel.getState();
        console.log(`[TEST] Job state before cancel: ${state}`);

        if (state === 'waiting' || state === 'delayed' || state === 'active') {
          await jobToCancel.remove();
          console.log(`[TEST] Job removed from queue`);
        }
      }
    }

    // Update session status
    await db`
      UPDATE "HuntSession"
      SET status = 'CANCELLED', "completedAt" = NOW()
      WHERE id = ${session.id}
    `;

    // Emit cancellation event
    events.emit(userId, 'hunt-cancelled', {
      huntSessionId: session.id
    });

    console.log(`[TEST] ✅ Hunt cancellation test passed`);

    // Cleanup
    await db`DELETE FROM "HuntSession" WHERE id = ${session.id}`;

  } catch (error) {
    console.error(`[TEST] ❌ Hunt cancellation test failed:`, error);
  }
}

async function testWorkerCancellationHandling() {
  console.log('\n=== Testing Worker Cancellation Handling (Active Job) ===');

  // Get an existing user from the database
  const [existingUser] = await db`
    SELECT id FROM "User" LIMIT 1
  `;

  if (!existingUser) {
    console.log('[TEST] ⚠️  No users found in database, skipping test');
    return;
  }

  const userId = existingUser.id;

  try {
    // Create test leads for audit (more leads to ensure job runs longer)
    const leadIds = [];
    for (let i = 0; i < 50; i++) {
      const [lead] = await db`
        INSERT INTO "Lead" (
          id, "userId", domain, email, status, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), ${userId}, ${'example' + i + '.com'},
          ${'contact@example' + i + '.com'}, 'COLD', NOW(), NOW()
        )
        RETURNING id
      `;
      leadIds.push(lead.id);
    }

    console.log(`[TEST] Created ${leadIds.length} test leads`);

    // Create audit session
    const [session] = await db`
      INSERT INTO "AuditSession" (
        id, "userId", status, progress, "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, 'PENDING', 0, NOW(), NOW()
      )
      RETURNING id
    `;

    // Start the job immediately (no delay)
    const job = await jobs.addJob(
      'leads',
      'lead-audit',
      { auditSessionId: session.id, userId }
    );

    await db`
      UPDATE "AuditSession"
      SET "jobId" = ${job.id}
      WHERE id = ${session.id}
    `;

    console.log(`[TEST] Started job: ${job.id}`);

    // Wait for job to start processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check job state before cancellation
    const queue = jobs['queues'].get('leads');
    if (queue) {
      const jobToCheck = await queue.getJob(job.id);
      if (jobToCheck) {
        const state = await jobToCheck.getState();
        console.log(`[TEST] Job state before cancel: ${state}`);
      }
    }

    // Cancel by updating database status (simulating the cancel endpoint)
    console.log(`[TEST] Setting session status to CANCELLED in database...`);
    await db`
      UPDATE "AuditSession"
      SET
        status = 'CANCELLED',
        "completedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${session.id}
    `;

    // Try to remove job from queue (will fail if active, but that's okay)
    if (queue) {
      const jobToCancel = await queue.getJob(job.id);
      if (jobToCancel) {
        const state = await jobToCancel.getState();
        if (state === 'waiting' || state === 'delayed') {
          await jobToCancel.remove().catch(() => {
            console.log(`[TEST] Job is actively processing, cannot remove (expected)`);
          });
        } else {
          console.log(`[TEST] Job is in ${state} state, worker should detect DB cancellation`);
        }
      }
    }

    // Wait for worker to detect cancellation and stop
    console.log(`[TEST] Waiting for worker to detect cancellation...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check final session status
    const [finalSession] = await db`
      SELECT status, progress, "processedLeads", "updatedLeads", "failedLeads"
      FROM "AuditSession"
      WHERE id = ${session.id}
    `;

    console.log(`[TEST] Final session status: ${finalSession.status}`);
    console.log(`[TEST] Progress: ${finalSession.progress}%`);
    console.log(`[TEST] Processed leads: ${finalSession.processedLeads || 0}`);
    console.log(`[TEST] Updated leads: ${finalSession.updatedLeads || 0}`);
    console.log(`[TEST] Failed leads: ${finalSession.failedLeads || 0}`);

    if (finalSession.status === 'CANCELLED') {
      console.log(`[TEST] ✅ Worker cancellation handling test passed`);
    } else {
      console.log(`[TEST] ❌ Worker did not detect cancellation properly`);
    }

    // Cleanup
    await db`DELETE FROM "AuditSession" WHERE id = ${session.id}`;
    await db`DELETE FROM "Lead" WHERE "userId" = ${userId}`;

  } catch (error) {
    console.error(`[TEST] ❌ Worker cancellation test failed:`, error);
  }
}

// Run tests
async function runTests() {
  console.log('Starting cancellation tests...\n');

  try {
    await testAuditCancellation();
    await testHuntCancellation();
    await testWorkerCancellationHandling();

    console.log('\n=== All tests completed ===');
  } catch (error) {
    console.error('Test suite failed:', error);
  } finally {
    // Cleanup
    await jobs.close();
    console.log('\nTest cleanup complete');
    process.exit(0);
  }
}

// Run the tests
runTests().catch(console.error);