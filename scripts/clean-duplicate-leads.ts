import { db } from '@repo/database';

/**
 * cleanDuplicates
 */
async function cleanDuplicates() {
  console.log('Starting duplicate lead cleanup...');

  const allLeads = await db.lead.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      email: true,
      domain: true,
      firstName: true,
      lastName: true,
      createdAt: true,
    },
  });

  console.log(`Found ${allLeads.length} total leads`);

  const uniqueKeys = new Map<string, string>();
  const duplicateIds: string[] = [];

  /**
   * for
   */
  for (const lead of allLeads) {
    const keys: string[] = [];

    /**
     * if
     */
    if (lead.email) {
      keys.push(`${lead.userId}:email:${lead.email}`);
    }

    /**
     * if
     */
    if (lead.domain && lead.firstName && lead.lastName) {
      keys.push(`${lead.userId}:person:${lead.domain}:${lead.firstName}:${lead.lastName}`);
    }

    let isDuplicate = false;
    /**
     * for
     */
    for (const key of keys) {
      /**
       * if
       */
      if (uniqueKeys.has(key)) {
        isDuplicate = true;
        break;
      }
    }

    /**
     * if
     */
    if (isDuplicate) {
      duplicateIds.push(lead.id);
      console.log(`Duplicate found: ${lead.email || `${lead.firstName} ${lead.lastName}`} (${lead.id})`);
    } else {
      /**
       * for
       */
      for (const key of keys) {
        uniqueKeys.set(key, lead.id);
      }
    }
  }

  /**
   * if
   */
  if (duplicateIds.length === 0) {
    console.log('No duplicates found!');
    return;
  }

  console.log(`\nFound ${duplicateIds.length} duplicate leads`);
  console.log('Deleting duplicates...');

  const result = await db.lead.deleteMany({
    where: {
      id: { in: duplicateIds },
    },
  });

  console.log(`Deleted ${result.count} duplicate leads`);
  console.log('Cleanup complete!');
}

/**
 * cleanDuplicates
 */
cleanDuplicates()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error cleaning duplicates:', error);
    process.exit(1);
  });
