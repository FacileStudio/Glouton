import { Queue } from 'bullmq';
import { createJobConfig } from '@repo/jobs';

const redisConfig = createJobConfig({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

/**
 * forceCleanup
 */
async function forceCleanup() {
  console.log('Force cleaning Redis queues...\n');

  const queue = new Queue('leads', redisConfig);

  console.log('Obliterating entire queue...');
  await queue.obliterate({ force: true });
  console.log('✓ Queue obliterated');

  await queue.close();
  console.log('\n=== Force Cleanup Complete ===');
}

/**
 * forceCleanup
 */
forceCleanup().catch((error) => {
  console.error('Force cleanup failed:', error);
  process.exit(1);
});
