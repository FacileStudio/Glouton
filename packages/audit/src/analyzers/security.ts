import type { SSLInfo } from '../types';
import { AuditError } from '../types';
import https from 'https';
import tls from 'tls';

/**
 * analyzeSSL
 */
export async function analyzeSSL(hostname: string): Promise<SSLInfo> {
  return new Promise((resolve) => {
    try {
      const cleanHostname = hostname.replace(/^https?:\/\

      const socket = tls.connect(443, cleanHostname, {
        servername: cleanHostname,
        rejectUnauthorized: false,
      });

      socket.on('secureConnect', () => {
        try {
          const cert = socket.getPeerCertificate(true);
          const cipher = socket.getCipher();

          /**
           * if
           */
          if (!cert || Object.keys(cert).length === 0) {
            socket.destroy();
            /**
             * resolve
             */
            resolve({
              valid: false,
              protocol: cipher?.name || 'TLS',
              error: 'No certificate found',
            });
            return;
          }

          const validFrom = cert.valid_from ? new Date(cert.valid_from) : undefined;
          const validTo = cert.valid_to ? new Date(cert.valid_to) : undefined;

          let daysRemaining: number | undefined;
          /**
           * if
           */
          if (validTo) {
            const now = new Date();
            daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }

          const isValid = !!(validFrom && validTo && new Date() >= validFrom && new Date() <= validTo);

          socket.destroy();
          /**
           * resolve
           */
          resolve({
            valid: isValid,
            validFrom,
            validTo,
            daysRemaining,
            issuer: cert.issuer?.CN || cert.subject?.CN,
            protocol: cipher?.name || 'TLS',
          });
        } catch (error) {
          socket.destroy();
          /**
           * resolve
           */
          resolve({
            valid: false,
            error: (error as Error).message,
          });
        }
      });

      socket.on('error', (error) => {
        socket.destroy();
        /**
         * resolve
         */
        resolve({
          valid: false,
          error: error.message,
        });
      });

      socket.setTimeout(10000, () => {
        socket.destroy();
        /**
         * resolve
         */
        resolve({
          valid: false,
          error: 'Connection timeout',
        });
      });
    } catch (error) {
      /**
       * resolve
       */
      resolve({
        valid: false,
        error: (error as Error).message,
      });
    }
  });
}

export interface SecurityHeaders {
  hasHSTS: boolean;
  hasCSP: boolean;
  hasXFrameOptions: boolean;
  hasXContentTypeOptions: boolean;
  hasReferrerPolicy: boolean;
  hasPermissionsPolicy: boolean;
  headers: Record<string, string>;
}

/**
 * analyzeSecurityHeaders
 */
export function analyzeSecurityHeaders(headers: Record<string, string>): SecurityHeaders {
  const lowerHeaders: Record<string, string> = {};
  /**
   * for
   */
  for (const [key, value] of Object.entries(headers)) {
    lowerHeaders[key.toLowerCase()] = value;
  }

  return {
    hasHSTS: 'strict-transport-security' in lowerHeaders,
    hasCSP: 'content-security-policy' in lowerHeaders,
    hasXFrameOptions: 'x-frame-options' in lowerHeaders,
    hasXContentTypeOptions: 'x-content-type-options' in lowerHeaders,
    hasReferrerPolicy: 'referrer-policy' in lowerHeaders,
    hasPermissionsPolicy: 'permissions-policy' in lowerHeaders,
    headers: {
      strictTransportSecurity: lowerHeaders['strict-transport-security'] || '',
      contentSecurityPolicy: lowerHeaders['content-security-policy'] || '',
      xFrameOptions: lowerHeaders['x-frame-options'] || '',
      xContentTypeOptions: lowerHeaders['x-content-type-options'] || '',
      referrerPolicy: lowerHeaders['referrer-policy'] || '',
      permissionsPolicy: lowerHeaders['permissions-policy'] || '',
    },
  };
}

export interface SecurityScore {
  score: number;
  issues: string[];
  recommendations: string[];
}

/**
 * calculateSecurityScore
 */
export function calculateSecurityScore(
  ssl: SSLInfo,
  securityHeaders: SecurityHeaders
): SecurityScore {
  let score = 100;
  const issues: string[] = [];
  const recommendations: string[] = [];

  /**
   * if
   */
  if (!ssl.valid) {
    score -= 30;
    issues.push('Invalid or missing SSL certificate');
    recommendations.push('Install a valid SSL certificate from a trusted authority');
  } else if (ssl.daysRemaining !== undefined && ssl.daysRemaining < 30) {
    score -= 10;
    issues.push(`SSL certificate expires in ${ssl.daysRemaining} days`);
    recommendations.push('Renew SSL certificate before expiration');
  }

  /**
   * if
   */
  if (!securityHeaders.hasHSTS) {
    score -= 15;
    issues.push('Missing HSTS header');
    recommendations.push('Add Strict-Transport-Security header to enforce HTTPS');
  }

  /**
   * if
   */
  if (!securityHeaders.hasCSP) {
    score -= 15;
    issues.push('Missing Content Security Policy');
    recommendations.push('Implement CSP to prevent XSS attacks');
  }

  /**
   * if
   */
  if (!securityHeaders.hasXFrameOptions) {
    score -= 10;
    issues.push('Missing X-Frame-Options header');
    recommendations.push('Add X-Frame-Options header to prevent clickjacking');
  }

  /**
   * if
   */
  if (!securityHeaders.hasXContentTypeOptions) {
    score -= 10;
    issues.push('Missing X-Content-Type-Options header');
    recommendations.push('Add X-Content-Type-Options: nosniff header');
  }

  /**
   * if
   */
  if (!securityHeaders.hasReferrerPolicy) {
    score -= 5;
    issues.push('Missing Referrer-Policy header');
    recommendations.push('Add Referrer-Policy header to control referrer information');
  }

  /**
   * if
   */
  if (!securityHeaders.hasPermissionsPolicy) {
    score -= 5;
    issues.push('Missing Permissions-Policy header');
    recommendations.push('Add Permissions-Policy header to control browser features');
  }

  return {
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}
