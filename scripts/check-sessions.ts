import { db } from '@repo/database';

const sessions = await db.auditSession.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: {
    id: true,
    status: true,
    totalLeads: true,
    processedLeads: true,
    updatedLeads: true,
    failedLeads: true,
    progress: true,
    createdAt: true,
    completedAt: true,
  },
});

console.log('Recent audit sessions:');
console.log(JSON.stringify(sessions, null, 2));

await db.$disconnect();
