import { HunterService } from '@repo/hunter';
import type { LeadSource, LeadSourceProvider } from './types';
import { HunterProvider } from './providers/hunter';

export interface ApiKeys {
  hunterApiKey?: string;
}

export class LeadSourceFactory {
  static create(source: LeadSource, apiKeys: ApiKeys): LeadSourceProvider {
    switch (source) {
      case 'HUNTER':
        if (!apiKeys.hunterApiKey) {
          throw new Error('Hunter.io API key is required');
        }
        return new HunterProvider(new HunterService(apiKeys.hunterApiKey));

      case 'MANUAL':
        throw new Error(`MANUAL provider not yet implemented`);

      default:
        throw new Error(`Unsupported lead source: ${source}`);
    }
  }

  static getApiKeyField(source: LeadSource): keyof ApiKeys {
    const fieldMap: Record<LeadSource, keyof ApiKeys> = {
      HUNTER: 'hunterApiKey',
      MANUAL: 'hunterApiKey',
    };
    return fieldMap[source];
  }
}
