import type { Row } from './types';

export const common = {
  'common.save': ['Save', 'Enregistrer', 'Guardar', 'Speichern'],
  'common.saving': ['Saving...', 'Enregistrement...', 'Guardando...', 'Wird gespeichert...'],
  'common.cancel': ['Cancel', 'Annuler', 'Cancelar', 'Abbrechen'],
  'common.confirm': ['Confirm', 'Confirmer', 'Confirmar', 'Bestätigen'],
} as const satisfies Record<string, Row>;
