#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface KirbyLead {
  nomOrganisation: string;
  domaine: string;
  secteur: string;
  taille: string;
  annee: string;
  ville: string;
}

interface GloutonLead {
  nomOrganisation: string;
  domaine: string;
  email: string;
  prenom: string;
  nom: string;
  position: string;
  departement: string;
  score: number;
  status: 'HOT' | 'WARM' | 'COLD';
  source: string;
}

/**
 * parseCSVLine
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  /**
   * for
   */
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    /**
     * if
     */
    if (char === '"') {
      /**
       * if
       */
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values.map((v) => v.replace(/^"|"$/g, ''));
}

/**
 * escapeCSV
 */
function escapeCSV(value: string | number): string {
  const str = String(value);
  /**
   * if
   */
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * convertKirbyToGlouton
 */
function convertKirbyToGlouton(inputPath: string, outputPath: string) {
  console.log('🔄 Converting Kirby leads to Glouton format...\n');

  const csvContent = readFileSync(inputPath, 'utf-8');
  const lines = csvContent.split('\n').filter((line) => line.trim());

  /**
   * if
   */
  if (lines.length < 2) {
    console.error('❌ Error: CSV file is empty or has no data rows');
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]);

  const kirbyHeaders = ['Nom Organisation', 'Domaine', 'Secteur', 'Taille', 'Annee', 'Ville'];
  const isKirbyFormat = kirbyHeaders.every((h) => headers.includes(h));

  /**
   * if
   */
  if (!isKirbyFormat) {
    console.error('❌ Error: Input file is not in Kirby format');
    console.error('Expected headers:', kirbyHeaders.join(', '));
    console.error('Found headers:', headers.join(', '));
    process.exit(1);
  }

  console.log('✅ Kirby format detected');
  console.log(`📊 Found ${lines.length - 1} leads to convert\n`);

  const gloutonHeaders = [
    'Nom Organisation',
    'Domaine',
    'Email',
    'Prenom',
    'Nom',
    'Position',
    'Departement',
    'Score',
    'Status',
    'Source',
  ];

  const gloutonRows: string[] = [gloutonHeaders.join(',')];

  const nomOrgIndex = headers.indexOf('Nom Organisation');
  const domaineIndex = headers.indexOf('Domaine');
  const secteurIndex = headers.indexOf('Secteur');
  const villeIndex = headers.indexOf('Ville');

  let converted = 0;
  let errors = 0;

  /**
   * for
   */
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i]);

      const nomOrganisation = values[nomOrgIndex] || '';
      const domaine = values[domaineIndex] || '';
      const secteur = values[secteurIndex] || '';
      const ville = values[villeIndex] || '';

      /**
       * if
       */
      if (!domaine) {
        console.warn(`⚠️  Row ${i + 1}: Skipping - missing domain`);
        errors++;
        continue;
      }

      const prenom = nomOrganisation.split(' ')[0] || '';
      const nom = nomOrganisation.split(' ').slice(1).join(' ') || nomOrganisation;
      const email = `contact@${domaine}`;

      let score = 50;
      let status: 'HOT' | 'WARM' | 'COLD' = 'COLD';

      /**
       * if
       */
      if (domaine.match(/\.(com|fr|eu)$/)) {
        score += 10;
      }
      /**
       * if
       */
      if (secteur) {
        score += 15;
      }
      /**
       * if
       */
      if (ville) {
        score += 10;
      }

      /**
       * if
       */
      if (score >= 70) {
        status = 'HOT';
      } else if (score >= 55) {
        status = 'WARM';
      }

      const gloutonLead: GloutonLead = {
        nomOrganisation,
        domaine,
        email,
        prenom,
        nom,
        position: '',
        departement: secteur || '',
        score,
        status,
        source: 'MANUAL',
      };

      const row = [
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.nomOrganisation),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.domaine),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.email),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.prenom),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.nom),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.position),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.departement),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.score),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.status),
        /**
         * escapeCSV
         */
        escapeCSV(gloutonLead.source),
      ].join(',');

      gloutonRows.push(row);
      converted++;
    } catch (error) {
      console.error(`❌ Row ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`);
      errors++;
    }
  }

  const outputCSV = gloutonRows.join('\n');
  /**
   * writeFileSync
   */
  writeFileSync(outputPath, outputCSV, 'utf-8');

  console.log('\n✅ Conversion complete!');
  console.log(`📊 Results:`);
  console.log(`   • Converted: ${converted} leads`);
  console.log(`   • Errors: ${errors}`);
  console.log(`   • Output file: ${outputPath}\n`);
  console.log('💡 You can now import this file using the "Import CSV" button in Glouton');
}

const args = process.argv.slice(2);

/**
 * if
 */
if (args.length < 2) {
  console.log('Usage: bun run scripts/convert-kirby-to-glouton.ts <input.csv> <output.csv>');
  console.log('\nExample:');
  console.log('  bun run scripts/convert-kirby-to-glouton.ts kirby-leads.csv glouton-leads.csv');
  process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1];

/**
 * convertKirbyToGlouton
 */
convertKirbyToGlouton(inputPath, outputPath);
