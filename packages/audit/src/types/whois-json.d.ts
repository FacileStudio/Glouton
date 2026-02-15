declare module 'whois-json' {
  interface WhoisData {
    domainName?: string;
    registrar?: string;
    createdDate?: string;
    expiresDate?: string;
    updatedDate?: string;
    status?: string | string[];
    nameServers?: string | string[];
    organizationName?: string;
    organizationCountry?: string;
    [key: string]: unknown;
  }

  interface WhoisOptions {
    follow?: number;
    timeout?: number;
  }

  /**
   * whois
   */
  function whois(domain: string, options?: WhoisOptions): Promise<WhoisData>;

  export = whois;
}
