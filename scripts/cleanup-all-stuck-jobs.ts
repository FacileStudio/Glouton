import { db } from '@repo/database';
import { Queue } from 'bullmq';
import { createJobConfig } from '@repo/jobs';
import logger from '@repo/logger';

const redisConfig = createJobConfig({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

/**
 * cleanupAll
 */
async function cleanupAll() {
  console.log('=== Cleanup All Stuck Jobs & Sessions ===\n');

  console.log('1. Cleaning up stuck audit sessions...');
  const stuckAudits = await db.auditSession.findMany({
    where: {
      status: {
        in: ['PENDING', 'PROCESSING'],
      },
    },
  });

  console.log(`Found ${stuckAudits.length} stuck audit sessions`);
  /**
   * for
   */
  for (const session of stuckAudits) {
    await db.auditSession.update({
      where: { id: session.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });
    console.log(`  ✓ Cancelled audit session: ${session.id}`);
  }

  console.log('\n2. Cleaning up stuck hunt sessions...');
  const stuckHunts = await db.huntSession.findMany({
    where: {
      status: {
        in: ['PENDING', 'PROCESSING'],
      },
    },
  });

  console.log(`Found ${stuckHunts.length} stuck hunt sessions`);
  /**
   * for
   */
  for (const session of stuckHunts) {
    await db.huntSession.update({
      where: { id: session.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });
    console.log(`  ✓ Cancelled hunt session: ${session.id}`);
  }

  console.log('\n3. Cleaning up stuck Redis jobs...');
  const queue = new Queue('leads', redisConfig);

  const activeJobs = await queue.getActive();
  console.log(`Found ${activeJobs.length} active jobs in Redis`);

  /**
   * for
   */
  for (const job of activeJobs) {
    await job.remove();
    console.log(`  ✓ Removed job: ${job.id} (${job.name})`);
  }

  await queue.close();

  console.log('\n=== Cleanup Complete ===');
  await db.$disconnect();
}

/**
 * cleanupAll
 */
cleanupAll().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
