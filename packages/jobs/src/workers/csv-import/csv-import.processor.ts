import type { Job as BullJob } from 'bullmq';
import { prisma } from '@repo/database';
import type { Prisma, LeadSource, LeadStatus, BusinessType } from '@prisma/client';
import type { JobEventEmitter } from '../../lib/job-event-emitter';
import { SessionManager, CancellationChecker } from '../shared';
import type { CsvImportData } from './csv-import.types';

const BATCH_SIZE = 10;

interface ParsedLead {
  userId: string;
  teamId: string | null;
  huntSessionId: string;
  source: LeadSource;
  sourceId: string;
  businessType: BusinessType;
  domain: string | null;
  email: string | null;
  additionalEmails: string[];
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
  phoneNumbers: string[];
  physicalAddresses: string[];
  businessName: string | null;
  category: string | null;
  coordinates: any;
  openingHours: string | null;
  hasWebsite: boolean;
  city: string | null;
  country: string | null;
  technologies: string[];
  socialProfiles: any;
  companyInfo: any;
  websiteAudit: any;
  status: LeadStatus;
  score: number;
  contacted: boolean;
  lastContactedAt: Date | null;
  emailsSentCount: number;
}

export class CsvImportProcessor {
  private sessionManager = new SessionManager();
  private cancellationChecker = new CancellationChecker();

  async process(job: BullJob<CsvImportData>, emitter: JobEventEmitter): Promise<void> {
    const { huntSessionId, userId, teamId, csvContent } = job.data;

    const currentSession = await this.checkSession(huntSessionId);
    if (!currentSession) return;

    await this.startSessionIfNeeded(huntSessionId, currentSession, emitter);
    await job.updateProgress(5);

    if (await this.cancellationChecker.checkHuntCancellation(job)) {
      return await this.handleCancellation(huntSessionId, currentSession, emitter);
    }

    emitter.emit('hunt-progress', {
      huntSessionId,
      progress: 10,
      totalLeads: 0,
      successfulLeads: 0,
      status: 'PROCESSING',
    });

    const { leads, errors } = await this.parseCSV(csvContent, userId, teamId, huntSessionId, emitter);
    await job.updateProgress(30);

    if (leads.length === 0) {
      throw new Error('No valid leads found in CSV');
    }

    emitter.emit('hunt-progress', {
      huntSessionId,
      progress: 40,
      totalLeads: 0,
      successfulLeads: 0,
      status: 'PROCESSING',
    });

    if (await this.cancellationChecker.checkHuntCancellation(job)) {
      return await this.handleCancellation(huntSessionId, currentSession, emitter);
    }

    const { imported, duplicates } = await this.insertLeadsInBatches(
      leads,
      huntSessionId,
      job,
      emitter
    );

    await this.finalizeImport(huntSessionId, imported, duplicates, errors.length, emitter);
    await job.updateProgress(100);
  }

  private async checkSession(huntSessionId: string) {
    const session = await prisma.huntSession.findUnique({
      where: { id: huntSessionId },
      select: { status: true, totalLeads: true, successfulLeads: true },
    });

    if (!session) {
      console.warn(`[CsvImport] Session ${huntSessionId} not found, skipping job`);
      return null;
    }

    return session;
  }

  private async startSessionIfNeeded(
    huntSessionId: string,
    currentSession: any,
    emitter: JobEventEmitter
  ): Promise<void> {
    if (currentSession.status === 'PENDING') {
      await this.sessionManager.startSession(huntSessionId);

      emitter.emit('hunt-started', {
        huntSessionId,
        huntType: 'DOMAIN',
        message: 'Starting CSV import...',
      });

      emitter.emit('hunt-processing', {
        huntSessionId,
        startedAt: new Date().toISOString(),
      });
    }
  }

  private async parseCSV(
    csvContent: string,
    userId: string,
    teamId: string | null | undefined,
    huntSessionId: string,
    emitter: JobEventEmitter
  ): Promise<{ leads: ParsedLead[]; errors: string[] }> {
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = this.parseCSVLine(lines[0]);
    const dataLines = lines.slice(1);
    const leads: ParsedLead[] = [];
    const errors: string[] = [];

    emitter.emit('hunt-progress', {
      huntSessionId,
      progress: 15,
      totalLeads: 0,
      successfulLeads: 0,
      status: 'PROCESSING',
    });

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      if (!line) continue;

      try {
        const values = this.parseCSVLine(line);

        const getHeaderValue = (headerName: string) => {
          const index = headers.indexOf(headerName);
          return index !== -1 ? values[index] : '';
        };

        const domain = getHeaderValue('Domaine');
        const organization = getHeaderValue('Nom Organisation');
        const email = getHeaderValue('Email');

        if (!domain && !organization && !email) {
          errors.push(`Row ${i + 2}: Missing domain, organization name, and email`);
          continue;
        }

        const city = getHeaderValue('Ville');
        const country = getHeaderValue('Pays');
        const emailValue = email || (domain ? `contact@${domain}` : null);
        const firstName = getHeaderValue('Prenom') || (organization ? organization.split(' ')[0] : '') || '';
        const lastName = getHeaderValue('Nom') || (organization ? organization.split(' ').slice(1).join(' ') : '') || '';
        const position = getHeaderValue('Position') || null;
        const department = getHeaderValue('Departement') || null;

        const businessTypeStr = getHeaderValue('Type Business');
        const businessType = businessTypeStr === 'LOCAL_BUSINESS' ? 'LOCAL_BUSINESS' : 'DOMAIN';

        const additionalEmails = this.parseCSVArray(getHeaderValue('Emails Additionnels'));
        const phoneNumbers = this.parseCSVArray(getHeaderValue('Numeros Telephone'));
        const physicalAddresses = this.parseCSVArray(getHeaderValue('Adresses Physiques'));
        const technologies = this.parseCSVArray(getHeaderValue('Technologies'));

        const coordinates = this.parseCSVJson(getHeaderValue('Coordonnees'));
        const socialProfiles = this.parseCSVJson(getHeaderValue('Profils Sociaux'));
        const companyInfo = this.parseCSVJson(getHeaderValue('Info Entreprise'));
        const websiteAudit = this.parseCSVJson(getHeaderValue('Audit Site Web'));

        const category = getHeaderValue('Categorie') || null;
        const openingHours = getHeaderValue('Horaires Ouverture') || null;
        const hasWebsite = this.parseCSVBoolean(getHeaderValue('A un Site Web'));

        const statusStr = getHeaderValue('Status');
        const status: LeadStatus = ['HOT', 'WARM', 'COLD'].includes(statusStr)
          ? (statusStr as LeadStatus)
          : 'COLD';

        const sourceStr = getHeaderValue('Source');
        const source: LeadSource = [
          'HUNTER',
          'APOLLO',
          'SNOV',
          'HASDATA',
          'CONTACTOUT',
          'MANUAL',
          'GOOGLE_MAPS',
          'OPENSTREETMAP',
        ].includes(sourceStr)
          ? (sourceStr as LeadSource)
          : 'MANUAL';

        const scoreStr = getHeaderValue('Score');
        const score = scoreStr ? parseInt(scoreStr, 10) : 50;

        const contacted = this.parseCSVBoolean(getHeaderValue('Contacte'));
        const lastContactedAtStr = getHeaderValue('Derniere Date Contact');
        const lastContactedAt = lastContactedAtStr ? new Date(lastContactedAtStr) : null;

        const emailsSentCountStr = getHeaderValue('Nombre Emails Envoyes');
        const emailsSentCount = emailsSentCountStr ? parseInt(emailsSentCountStr, 10) : 0;

        leads.push({
          userId,
          teamId: teamId || null,
          huntSessionId,
          source,
          sourceId: `csv-import:${domain || organization || email}:${i}`,
          businessType,
          domain: domain || null,
          email: emailValue,
          additionalEmails,
          firstName,
          lastName,
          position,
          department,
          phoneNumbers,
          physicalAddresses,
          businessName: organization || null,
          category,
          coordinates,
          openingHours,
          hasWebsite,
          city: city || null,
          country: country || null,
          technologies,
          socialProfiles,
          companyInfo,
          websiteAudit,
          status,
          score: isNaN(score) ? 50 : score,
          contacted,
          lastContactedAt,
          emailsSentCount: isNaN(emailsSentCount) ? 0 : emailsSentCount,
        });
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Parse error'}`);
      }

      if ((i + 1) % 100 === 0) {
        const progress = 15 + Math.floor(((i + 1) / dataLines.length) * 15);
        emitter.emit('hunt-progress', {
          huntSessionId,
          progress,
          totalLeads: 0,
          successfulLeads: 0,
          status: 'PROCESSING',
        });
      }
    }

    if (errors.length > 0) {
      emitter.emit('hunt-progress', {
        huntSessionId,
        progress: 30,
        totalLeads: 0,
        successfulLeads: 0,
        status: 'PROCESSING',
      });

      for (const error of errors.slice(0, 10)) {
        emitter.emit('hunt-error', {
          huntSessionId,
          error,
          message: error,
        });
      }

      if (errors.length > 10) {
        emitter.emit('hunt-error', {
          huntSessionId,
          error: `... and ${errors.length - 10} more parse errors`,
          message: `... and ${errors.length - 10} more parse errors`,
        });
      }
    }

    return { leads, errors };
  }

  private async insertLeadsInBatches(
    leads: ParsedLead[],
    huntSessionId: string,
    job: BullJob<CsvImportData>,
    emitter: JobEventEmitter
  ): Promise<{ imported: number; duplicates: number }> {
    let totalImported = 0;
    let totalDuplicates = 0;

    const batches = Math.ceil(leads.length / BATCH_SIZE);

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      if (await this.cancellationChecker.checkHuntCancellation(job)) {
        const currentSession = await this.checkSession(huntSessionId);
        if (currentSession) {
          await this.handleCancellation(huntSessionId, currentSession, emitter);
        }
        return { imported: totalImported, duplicates: totalDuplicates };
      }

      try {
        const result = await prisma.lead.createMany({
          data: batch,
          skipDuplicates: true,
        });

        totalImported += result.count;
        totalDuplicates += batch.length - result.count;

        const progress = 40 + Math.floor((batchNumber / batches) * 55);

        emitter.emit('hunt-progress', {
          huntSessionId,
          progress,
          totalLeads: totalImported,
          successfulLeads: totalImported,
          status: 'PROCESSING',
        });

        emitter.emit('leads-created', {
          huntSessionId,
          count: result.count,
          message: `Batch ${batchNumber}/${batches}: Imported ${result.count}/${batch.length} leads (${totalDuplicates} duplicates skipped)`,
        });

        await this.sessionManager.updateSession(huntSessionId, {
          totalLeads: totalImported,
          successfulLeads: totalImported,
          progress,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        emitter.emit('hunt-error', {
          huntSessionId,
          error: `Batch ${batchNumber} failed: ${errorMsg}`,
          message: `Batch ${batchNumber} failed: ${errorMsg}`,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { imported: totalImported, duplicates: totalDuplicates };
  }

  private async finalizeImport(
    huntSessionId: string,
    imported: number,
    duplicates: number,
    parseErrors: number,
    emitter: JobEventEmitter
  ): Promise<void> {
    await this.sessionManager.completeSession(huntSessionId, {
      totalLeads: imported,
      successfulLeads: imported,
      failedLeads: parseErrors,
    });

    await prisma.huntSession.update({
      where: { id: huntSessionId },
      data: {
        sourceStats: {
          MANUAL: {
            leads: imported,
            errors: parseErrors,
            duplicates,
            rateLimited: false,
          },
        },
      },
    });

    emitter.emit('hunt-progress', {
      huntSessionId,
      progress: 100,
      totalLeads: imported,
      successfulLeads: imported,
      status: 'COMPLETED',
    });

    emitter.emit('hunt-completed', {
      huntSessionId,
      totalLeads: imported,
      successfulLeads: imported,
      message: `CSV import completed! Imported ${imported} leads (${duplicates} duplicates skipped, ${parseErrors} parse errors)`,
    });
  }

  private async handleCancellation(
    huntSessionId: string,
    currentSession: any,
    emitter: JobEventEmitter
  ): Promise<void> {
    await this.sessionManager.cancelSession(huntSessionId);

    emitter.emit('hunt-cancelled', {
      huntSessionId,
      totalLeads: currentSession.totalLeads || 0,
      successfulLeads: currentSession.successfulLeads || 0,
    });
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          j++;
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

    return values;
  }

  private parseCSVArray(str: string): string[] {
    if (!str) return [];
    return str
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private parseCSVJson(str: string): any {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  private parseCSVBoolean(str: string): boolean {
    const normalized = str.toLowerCase();
    return normalized === 'oui' || normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
}
