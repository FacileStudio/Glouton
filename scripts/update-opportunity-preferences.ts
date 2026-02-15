import { db, OpportunitySource, OpportunityCategory } from '@repo/database';

const allSources = [
  OpportunitySource.MALT,
  OpportunitySource.CODEUR,
  OpportunitySource.FREELANCE_INFORMATIQUE,
  OpportunitySource.COMET,
  OpportunitySource.LE_HIBOU,
  OpportunitySource.UPWORK,
  OpportunitySource.FIVERR,
  OpportunitySource.FREELANCER,
  OpportunitySource.TOPTAL,
  OpportunitySource.WE_WORK_REMOTELY,
  OpportunitySource.REMOTE_CO,
  OpportunitySource.REMOTIVE,
  OpportunitySource.LINKEDIN,
  OpportunitySource.INDEED,
  OpportunitySource.GURU,
  OpportunitySource.PEOPLEPERHOUR,
];

const allCategories = [
  OpportunityCategory.WEB_DEVELOPMENT,
  OpportunityCategory.WEB_DESIGN,
  OpportunityCategory.MOBILE_DEVELOPMENT,
  OpportunityCategory.UI_UX_DESIGN,
  OpportunityCategory.FRONTEND,
  OpportunityCategory.BACKEND,
  OpportunityCategory.FULLSTACK,
  OpportunityCategory.DEVOPS,
  OpportunityCategory.DATA_SCIENCE,
  OpportunityCategory.MACHINE_LEARNING,
  OpportunityCategory.BLOCKCHAIN,
  OpportunityCategory.GAME_DEVELOPMENT,
  OpportunityCategory.WORDPRESS,
  OpportunityCategory.ECOMMERCE,
  OpportunityCategory.SEO,
  OpportunityCategory.CONTENT_WRITING,
  OpportunityCategory.COPYWRITING,
  OpportunityCategory.GRAPHIC_DESIGN,
  OpportunityCategory.VIDEO_EDITING,
  OpportunityCategory.MARKETING,
  OpportunityCategory.CONSULTING,
  OpportunityCategory.OTHER,
];

/**
 * updateOpportunityPreferences
 */
async function updateOpportunityPreferences() {
  console.log('📊 Updating opportunity preferences for all users...');

  const users = await db.user.findMany({
    include: {
      opportunityPreferences: true,
    },
  });

  console.log(`Found ${users.length} users`);

  /**
   * for
   */
  for (const user of users) {
    try {
      /**
       * if
       */
      if (user.opportunityPreferences) {
        await db.userOpportunityPreferences.update({
          where: { userId: user.id },
          data: {
            enabledSources: allSources,
            enabledCategories: allCategories,
            keywords: user.opportunityPreferences.keywords || [],
            excludeKeywords: user.opportunityPreferences.excludeKeywords || [],
          },
        });
        console.log(`✅ Updated preferences for user ${user.email}`);
      } else {
        await db.userOpportunityPreferences.create({
          data: {
            userId: user.id,
            enabledSources: allSources,
            enabledCategories: allCategories,
            keywords: [],
            excludeKeywords: [],
          },
        });
        console.log(`✅ Created preferences for user ${user.email}`);
      }
    } catch (error) {
      console.error(`❌ Error updating user ${user.email}:`, error);
    }
  }

  console.log('✅ Done!');
  process.exit(0);
}

/**
 * updateOpportunityPreferences
 */
updateOpportunityPreferences().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
