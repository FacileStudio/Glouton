export function parseCSVLine(line: string): string[] {
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

export function parseCSVArray(str: string): string[] {
  if (!str) return [];
  return str.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
}

export function parseCSVJson(str: string): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function parseCSVBoolean(str: string): boolean {
  const normalized = str.toLowerCase();
  return normalized === 'oui' || normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function escapeCSVField(str: string | null | undefined): string {
  if (!str) return '';
  return `"${String(str).replace(/"/g, '""')}"`;
}

export function escapeCSVArray(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '';
  return `"${arr.join(';').replace(/"/g, '""')}"`;
}

export function escapeCSVJson(obj: any): string {
  if (!obj) return '';
  return `"${JSON.stringify(obj).replace(/"/g, '""')}"`;
}

export const CSV_HEADERS = [
  'Nom Organisation',
  'Type Business',
  'Domaine',
  'Email',
  'Emails Additionnels',
  'Prenom',
  'Nom',
  'Position',
  'Departement',
  'Numeros Telephone',
  'Adresses Physiques',
  'Categorie',
  'Coordonnees',
  'Horaires Ouverture',
  'A un Site Web',
  'Ville',
  'Pays',
  'Score',
  'Status',
  'Source',
  'Technologies',
  'Profils Sociaux',
  'Info Entreprise',
  'Audit Site Web',
  'Contacte',
  'Derniere Date Contact',
  'Nombre Emails Envoyes',
];

