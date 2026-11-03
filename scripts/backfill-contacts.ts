import { prisma } from '@repo/database/prisma';
import { linkOutreachToContacts, mirrorLeadsToContacts } from '@repo/database/contacts';

const dryRun = process.argv.includes('--dry-run');

const leads = await mirrorLeadsToContacts(prisma, {}, { dryRun });
const outreach = await linkOutreachToContacts(prisma, { dryRun });

console.log(
  JSON.stringify(
    {
      dryRun,
      leadsScanned: leads.scanned,
      companiesCreated: leads.companies,
      peopleCreated: leads.people,
      outreachLinkedToCompany: outreach.companies,
      outreachLinkedToPerson: outreach.people,
    },
    null,
    2
  )
);

await prisma.$disconnect();
