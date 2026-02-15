import { HunterService } from '@repo/hunter';
import type { LeadSource, LeadSourceProvider } from './types';
import { HunterProvider } from './providers/hunter';
import { ApolloProvider } from './providers/apollo';
import { SnovProvider } from './providers/snov';

export interface ApiKeys {
  hunterApiKey?: string;
  apolloApiKey?: string;
  snovClientId?: string;
  snovClientSecret?: string;
  hasdataApiKey?: string;
  contactoutApiKey?: string;
}

export class LeadSourceFactory {
  static create(source: LeadSource, apiKeys: ApiKeys): LeadSourceProvider {
    /**
     * switch
     */
    switch (source) {
      case 'HUNTER':
        /**
         * if
         */
        if (!apiKeys.hunterApiKey) {
          throw new Error('Hunter.io API key is required');
        }
        return new HunterProvider(new HunterService(apiKeys.hunterApiKey));

      case 'APOLLO':
        /**
         * if
         */
        if (!apiKeys.apolloApiKey) {
          throw new Error('Apollo.io API key is required');
        }
        return new ApolloProvider(apiKeys.apolloApiKey);

      case 'SNOV':
        /**
         * if
         */
        if (!apiKeys.snovClientId || !apiKeys.snovClientSecret) {
          throw new Error('Snov.io credentials are required');
        }
        return new SnovProvider(apiKeys.snovClientId, apiKeys.snovClientSecret);

      case 'HASDATA':
      case 'CONTACTOUT':
      case 'MANUAL':
        throw new Error(`${source} provider not yet implemented`);

      default:
        throw new Error(`Unsupported lead source: ${source}`);
    }
  }

  static getApiKeyField(source: LeadSource): keyof ApiKeys {
    const fieldMap: Record<LeadSource, keyof ApiKeys> = {
      HUNTER: 'hunterApiKey',
      APOLLO: 'apolloApiKey',
      SNOV: 'snovClientId',
      HASDATA: 'hasdataApiKey',
      CONTACTOUT: 'contactoutApiKey',
      MANUAL: 'hunterApiKey',
    };
    return fieldMap[source];
  }
}
