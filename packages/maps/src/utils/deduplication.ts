import type { LocalBusiness } from '../types';
import { calculateDistance } from './geocoding';



function normalizeString(str?: string): string {
  

  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}



function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  

  for (let i = 1; i <= str2.length; i++) {
    

    for (let j = 1; j <= str1.length; j++) {
      

      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}



function stringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  

  return (longer.length - editDistance) / longer.length;
}



function areBusinessesSimilar(b1: LocalBusiness, b2: LocalBusiness): boolean {
  const normalizedName1 = normalizeString(b1.name);
  const normalizedName2 = normalizeString(b2.name);

  const nameSimilarity = stringSimilarity(normalizedName1, normalizedName2);

  

  if (nameSimilarity < 0.8) {
    return false;
  }

  

  if (b1.coordinates && b2.coordinates) {
    const distance = calculateDistance(b1.coordinates, b2.coordinates);
    

    if (distance > 0.1) {
      return false;
    }
  }

  

  if (b1.phone && b2.phone) {
    const phone1 = normalizeString(b1.phone);
    const phone2 = normalizeString(b2.phone);
    

    if (phone1 === phone2) {
      return true;
    }
  }

  

  if (b1.website && b2.website) {
    const website1 = normalizeString(b1.website);
    const website2 = normalizeString(b2.website);
    

    if (website1 === website2) {
      return true;
    }
  }

  

  if (b1.address && b2.address) {
    const address1 = normalizeString(b1.address);
    const address2 = normalizeString(b2.address);
    const addressSimilarity = stringSimilarity(address1, address2);

    

    if (nameSimilarity > 0.9 && addressSimilarity > 0.8) {
      return true;
    }
  }

  return nameSimilarity > 0.95;
}



function mergeBusinesses(businesses: LocalBusiness[]): LocalBusiness {
  const merged: LocalBusiness = {
    source: businesses[0].source,
    name: businesses[0].name,
    hasWebsite: businesses.some((b) => b.hasWebsite),
  };

  

  for (const business of businesses) {
    

    if (!merged.address && business.address) merged.address = business.address;
    

    if (!merged.city && business.city) merged.city = business.city;
    

    if (!merged.state && business.state) merged.state = business.state;
    

    if (!merged.country && business.country) merged.country = business.country;
    

    if (!merged.postalCode && business.postalCode) merged.postalCode = business.postalCode;
    

    if (!merged.phone && business.phone) merged.phone = business.phone;
    

    if (!merged.website && business.website) merged.website = business.website;
    

    if (!merged.category && business.category) merged.category = business.category;
    

    if (!merged.coordinates && business.coordinates) merged.coordinates = business.coordinates;
    

    if (!merged.openingHours && business.openingHours)
      merged.openingHours = business.openingHours;

    

    if (!merged.rating && business.rating) {
      merged.rating = business.rating;
      merged.reviewCount = business.reviewCount;
    } else if (merged.rating && business.rating && business.source === 'google-maps') {
      merged.rating = business.rating;
      merged.reviewCount = business.reviewCount;
    }
  }

  merged.metadata = {
    sources: businesses.map((b) => b.source),
    duplicateCount: businesses.length,
  };

  return merged;
}



export function deduplicateBusinesses(businesses: LocalBusiness[]): LocalBusiness[] {
  

  if (businesses.length === 0) return [];

  const groups: LocalBusiness[][] = [];

  

  for (const business of businesses) {
    let foundGroup = false;

    

    for (const group of groups) {
      

      if (areBusinessesSimilar(business, group[0])) {
        group.push(business);
        foundGroup = true;
        break;
      }
    }

    

    if (!foundGroup) {
      groups.push([business]);
    }
  }

  return groups.map((group) => (group.length > 1 ? mergeBusinesses(group) : group[0]));
}



export function removeDuplicatesByName(businesses: LocalBusiness[]): LocalBusiness[] {
  const seen = new Set<string>();
  const result: LocalBusiness[] = [];

  

  for (const business of businesses) {
    const key = normalizeString(business.name);
    

    if (!seen.has(key)) {
      seen.add(key);
      result.push(business);
    }
  }

  return result;
}



export function removeDuplicatesByPhone(businesses: LocalBusiness[]): LocalBusiness[] {
  const seen = new Set<string>();
  const result: LocalBusiness[] = [];

  

  for (const business of businesses) {
    

    if (!business.phone) {
      result.push(business);
      continue;
    }

    const key = normalizeString(business.phone);
    

    if (!seen.has(key)) {
      seen.add(key);
      result.push(business);
    }
  }

  return result;
}
