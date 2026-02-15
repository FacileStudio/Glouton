import { db } from '@repo/database';

const huntSessions = await db.huntSession.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: {
    id: true,
    status: true,
    filters: true,
    totalLeads: true,
    successfulLeads: true,
    failedLeads: true,
    progress: true,
    createdAt: true,
    completedAt: true,
  },
});

console.log('Recent hunt sessions:');
console.log(JSON.stringify(huntSessions, null, 2));

const auditSessions = await db.auditSession.findMany({
  where: {
    status: {
      in: ['PENDING', 'PROCESSING'],
    },
  },
  select: {
    id: true,
    status: true,
    totalLeads: true,
    processedLeads: true,
    createdAt: true,
  },
});

console.log('\nActive audit sessions:');
console.log(JSON.stringify(auditSessions, null, 2));

await db.$disconnect();
