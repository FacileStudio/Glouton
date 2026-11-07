import type { Row } from './types';

export const composer = {
  'composer.editDraft': ['Edit the draft', 'Modifier le brouillon', 'Editar el borrador', 'Entwurf bearbeiten'],
  'composer.new': ['New email', 'Nouvel e-mail', 'Nuevo correo', 'Neue E-Mail'],
  'composer.to': ['To', 'À', 'Para', 'An'],
  'composer.addPersonFirst': ['Add a person first', 'Ajoutez d’abord une personne', 'Añade primero una persona', 'Fügen Sie zuerst eine Person hinzu'],
  'composer.noEmailSuffix': ['no email', '(sans e-mail)', '(sin correo)', '(ohne E-Mail)'],
  'composer.noEmail': ['This person has no email address.', 'Cette personne n’a pas d’adresse e-mail.', 'Esta persona no tiene dirección de correo.', 'Diese Person hat keine E-Mail-Adresse.'],
  'composer.template': ['Template', 'Modèle', 'Plantilla', 'Vorlage'],
  'composer.noTemplate': ['No template', 'Sans modèle', 'Sin plantilla', 'Ohne Vorlage'],
  'composer.via': ['Sending via {transport}', 'Envoi via {transport}', 'Envío con {transport}', 'Versand über {transport}'],
  'composer.notConfigured': ['Sending not set up', 'Envoi non configuré', 'Envío sin configurar', 'Versand nicht eingerichtet'],
  'composer.hideBulle': ['Hide Bulle', 'Masquer Bulle', 'Ocultar Bulle', 'Bulle ausblenden'],
  'composer.saveDraft': ['Save the draft', 'Enregistrer le brouillon', 'Guardar el borrador', 'Entwurf speichern'],
  'composer.shortcuts': ['Ctrl or ⌘ + Enter to send · Ctrl or ⌘ + J for Bulle', 'Ctrl ou ⌘ + Entrée pour envoyer · Ctrl ou ⌘ + J pour Bulle', 'Ctrl o ⌘ + Intro para enviar · Ctrl o ⌘ + J para Bulle', 'Strg oder ⌘ + Eingabe zum Senden · Strg oder ⌘ + J für Bulle']
} as const satisfies Record<string, Row>;
