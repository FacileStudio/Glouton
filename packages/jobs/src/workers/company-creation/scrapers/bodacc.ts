import type { ScrapedCompanyCreation, DirectorInfo } from '../company-creation.types';

interface BodaccRecord {
  id?: string;
  dateparution?: string;
  commercant?: string | null;
  denomination?: string | null;
  formeJuridique?: string | null;
  capital?: string | null;
  administration?: string | null;
  ville?: string | null;
  cp?: string | null;
  region_nom_officiel?: string | null;
  registre?: string[] | null;
  listeetablissements?: any;
  listepersonnes?: any;
  url_complete?: string | null;
}

interface BodaccApiResponse {
  total_count?: number;
  results?: BodaccRecord[];
}

interface RechercheEntreprisesResponse {
  results?: Array<{
    nom_complet?: string;
    activite_principale?: string;
    dirigeants?: Array<{
      nom?: string;
      prenoms?: string;
      qualite?: string;
      type_dirigeant?: string;
    }>;
  }>;
}

function parseJsonSafely(val: any): any {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

function extractSiren(record: BodaccRecord, person: any): string | null {
  if (Array.isArray(record.registre) && record.registre.length > 0) {
    for (const item of record.registre) {
      const cleaned = item.replace(/\s+/g, '');
      if (/^\d{9}$/.test(cleaned)) {
        return cleaned;
      }
    }
  }

  const idNum = person?.numeroImmatriculation?.numeroIdentification;
  if (typeof idNum === 'string') {
    const cleaned = idNum.replace(/\s+/g, '');
    if (/^\d{9}$/.test(cleaned)) {
      return cleaned;
    }
  }

  return null;
}

function extractName(record: BodaccRecord, person: any): string {
  if (record.denomination && record.denomination.trim()) {
    return record.denomination.trim();
  }
  if (record.commercant && record.commercant.trim()) {
    return record.commercant.trim();
  }
  if (person?.denomination && typeof person.denomination === 'string') {
    return person.denomination.trim();
  }
  if (person?.nomCommercial && typeof person.nomCommercial === 'string') {
    return person.nomCommercial.trim();
  }
  if (person?.nom && typeof person.nom === 'string') {
    const parts = [person.prenom, person.nom].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ').trim();
    }
  }
  return 'Entreprise en création';
}

function extractAddress(etab: any, person: any): { address?: string; city?: string; postalCode?: string } {
  const addr = etab?.adresse || person?.adresseSiegeSocial;
  if (!addr) {
    return {};
  }

  const streetParts = [addr.numeroVoie, addr.typeVoie, addr.nomVoie].filter(Boolean);
  const address = streetParts.length > 0 ? streetParts.join(' ').trim() : undefined;
  const city = typeof addr.ville === 'string' ? addr.ville.trim() : undefined;
  const postalCode = typeof addr.codePostal === 'string' ? addr.codePostal.trim() : undefined;

  return { address, city, postalCode };
}

function extractCapital(record: BodaccRecord, person: any): { capital?: number; currency?: string } {
  const capObj = person?.capital;
  if (capObj?.montantCapital) {
    const parsed = parseFloat(String(capObj.montantCapital).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        capital: parsed,
        currency: capObj.devise || 'EUR',
      };
    }
  }

  if (record.capital) {
    const parsed = parseFloat(String(record.capital).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        capital: parsed,
        currency: 'EUR',
      };
    }
  }

  return {};
}

function extractDirectorsFromBodacc(record: BodaccRecord, person: any): DirectorInfo[] {
  const directors: DirectorInfo[] = [];

  const adminStr = record.administration || person?.administration;
  if (typeof adminStr === 'string' && adminStr.trim()) {
    const segments = adminStr.split(';').map((s) => s.trim()).filter(Boolean);
    for (const segment of segments) {
      if (segment.includes(':')) {
        const [role, name] = segment.split(':').map((s) => s.trim());
        if (name) {
          directors.push({ name, role: role || undefined });
        }
      } else {
        directors.push({ name: segment });
      }
    }
  }

  if (directors.length === 0 && person?.nom) {
    const fullName = [person.prenom, person.nom].filter(Boolean).join(' ').trim();
    if (fullName) {
      directors.push({
        name: fullName,
        role: person.typePersonne === 'pp' ? 'Exploitant' : 'Dirigeant',
      });
    }
  }

  return directors;
}

async function enrichWithRechercheEntreprises(siren: string): Promise<{
  activityCode?: string;
  name?: string;
  directors?: DirectorInfo[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GloutonBot/1.0; +https://glouton.facile.studio)',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return {};
    }

    const data = (await res.json()) as RechercheEntreprisesResponse;
    const match = data.results?.[0];
    if (!match) {
      return {};
    }

    const activityCode = match.activite_principale || undefined;
    const name = match.nom_complet && !match.nom_complet.includes('[NON-DIFFUSIBLE]') ? match.nom_complet : undefined;

    const directors: DirectorInfo[] = [];
    if (Array.isArray(match.dirigeants)) {
      for (const d of match.dirigeants) {
        const fullName = [d.prenoms, d.nom].filter(Boolean).join(' ').trim();
        if (fullName && !fullName.includes('[NON-DIFFUSIBLE]')) {
          directors.push({
            name: fullName,
            role: d.qualite || d.type_dirigeant || undefined,
          });
        }
      }
    }

    return {
      activityCode,
      name,
      directors: directors.length > 0 ? directors : undefined,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeBodacc(limit = 100): Promise<ScrapedCompanyCreation[]> {
  const url = `https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records?where=familleavis%3D%22creation%22&order_by=dateparution%20desc&limit=${Math.min(limit, 100)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let responseData: BodaccApiResponse;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GloutonBot/1.0; +https://glouton.facile.studio)',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`BODACC API returned HTTP ${res.status}`);
    }

    responseData = (await res.json()) as BodaccApiResponse;
  } finally {
    clearTimeout(timer);
  }

  const records = responseData.results || [];
  const parsedItems: ScrapedCompanyCreation[] = [];

  for (const record of records) {
    const parsedPersonnes = parseJsonSafely(record.listepersonnes);
    const parsedEtablissements = parseJsonSafely(record.listeetablissements);

    const person = Array.isArray(parsedPersonnes?.personne)
      ? parsedPersonnes.personne[0]
      : parsedPersonnes?.personne;

    const etab = Array.isArray(parsedEtablissements?.etablissement)
      ? parsedEtablissements.etablissement[0]
      : parsedEtablissements?.etablissement;

    const siren = extractSiren(record, person);
    if (!siren) {
      continue;
    }

    const name = extractName(record, person);
    const legalForm = record.formeJuridique || person?.formeJuridique || (person?.typePersonne === 'pp' ? 'Entrepreneur individuel' : undefined);
    const addr = extractAddress(etab, person);
    const city = record.ville || addr.city || undefined;
    const postalCode = record.cp || addr.postalCode || undefined;
    const region = record.region_nom_officiel || undefined;
    const cap = extractCapital(record, person);
    const textualActivity = etab?.activite ? String(etab.activite).trim() : undefined;
    const initialDirectors = extractDirectorsFromBodacc(record, person);

    let activityCode: string | undefined;
    let activityLabel = textualActivity;

    const isSci =
      (legalForm && /société civile immobilière|sci/i.test(legalForm)) ||
      name.toLowerCase().startsWith('sci ') ||
      (textualActivity && /acquisition.*immeuble|location.*immobili/i.test(textualActivity));

    if (isSci) {
      activityCode = '68.20B';
      if (!activityLabel) {
        activityLabel = 'Location de logements';
      }
    }

    const publishedAt = record.dateparution ? new Date(record.dateparution) : new Date();
    const sourceUrl = record.url_complete || (record.id ? `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:${record.id}` : undefined);

    parsedItems.push({
      country: 'FR',
      registrationId: siren,
      name,
      legalForm,
      activityCode,
      activityLabel,
      address: addr.address,
      city,
      postalCode,
      region,
      capital: cap.capital,
      currency: cap.currency || 'EUR',
      directors: initialDirectors.length > 0 ? initialDirectors : undefined,
      sourceUrl,
      publishedAt,
    });
  }

  const enrichedItems: ScrapedCompanyCreation[] = [];
  const batchSize = 5;

  for (let i = 0; i < parsedItems.length; i += batchSize) {
    const chunk = parsedItems.slice(i, i + batchSize);
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        const enriched = await enrichWithRechercheEntreprises(item.registrationId);
        return {
          ...item,
          name: enriched.name || item.name,
          activityCode: enriched.activityCode || item.activityCode,
          directors: enriched.directors || item.directors,
        };
      })
    );
    enrichedItems.push(...chunkResults);
  }

  return enrichedItems;
}
