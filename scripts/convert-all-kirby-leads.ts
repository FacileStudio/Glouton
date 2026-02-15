#!/usr/bin/env bun

import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const kirbyLeadsDir = '/Users/fangafunk/Projects/Facile/Code/Kirby/leads';
const outputDir = '/Users/fangafunk/Projects/Facile/Code/Glouton/converted-leads';

console.log('🔄 Converting all Kirby leads to Glouton format...\n');
console.log(`📁 Input directory: ${kirbyLeadsDir}`);
console.log(`📁 Output directory: ${outputDir}\n`);

try {
  const files = readdirSync(kirbyLeadsDir);
  const csvFiles = files.filter((f) => f.endsWith('.csv'));

  console.log(`📊 Found ${csvFiles.length} CSV files\n`);

  let converted = 0;
  let failed = 0;

  /**
   * for
   */
  for (const file of csvFiles) {
    const inputPath = join(kirbyLeadsDir, file);
    const outputPath = join(outputDir, file.replace('.csv', '-glouton.csv'));

    try {
      console.log(`⏳ Converting: ${file}`);

      /**
       * execSync
       */
      execSync(
        `bun run /Users/fangafunk/Projects/Facile/Code/Glouton/scripts/convert-kirby-to-glouton.ts "${inputPath}" "${outputPath}"`,
        { stdio: 'pipe' }
      );

      converted++;
      console.log(`   ✅ Success\n`);
    } catch (error) {
      failed++;
      console.log(`   ❌ Failed\n`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Batch conversion complete!');
  console.log(`📊 Results:`);
  console.log(`   • Total files: ${csvFiles.length}`);
  console.log(`   • Converted: ${converted}`);
  console.log(`   • Failed: ${failed}`);
  console.log(`\n📁 Output location: ${outputDir}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
} catch (error) {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
