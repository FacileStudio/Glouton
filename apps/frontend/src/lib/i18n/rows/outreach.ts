import type { Row } from './types';

export const outreach = {
  'outreach.loadFailed': ['Could not load the outreach data', 'Échec du chargement des données de prospection', 'No se pudieron cargar los datos de prospección', 'Akquise-Daten konnten nicht geladen werden'],
  'outreach.historyFailed': ['Could not load the history', 'Échec du chargement de l\'historique', 'No se pudo cargar el historial', 'Verlauf konnte nicht geladen werden'],
  'outreach.followUp': ['To follow up', 'À relancer', 'Por reactivar', 'Nachzufassen'],
  'outreach.replied': ['Replied', 'Répondu', 'Respondido', 'Beantwortet'],
  'outreach.opened': ['Opened', 'Ouvert', 'Abierto', 'Geöffnet'],
  'outreach.clicked': ['Clicked', 'Cliqué', 'Clic hecho', 'Angeklickt'],
  'outreach.sentOne': ['Sent', 'Envoyé', 'Enviado', 'Gesendet'],
  'outreach.failedOne': ['Failed', 'Échoué', 'Fallido', 'Fehlgeschlagen'],
  'outreach.bounced': ['Bounced', 'Rejeté', 'Rechazado', 'Abgewiesen'],
  'outreach.sent': ['Sent', 'Envoyés', 'Enviados', 'Gesendet'],
  'outreach.contacted': ['Contacted', 'Contactés', 'Contactados', 'Kontaktiert'],
  'outreach.title': ['Outreach', 'Prospection', 'Prospección', 'Akquise'],
  'outreach.subtitle': ['Email history, follow-ups and replies', 'Historique des e-mails, relances et réponses', 'Historial de correos, seguimientos y respuestas', 'E-Mail-Verlauf, Nachfassaktionen und Antworten'],
  'outreach.searchPlaceholder': ['Search by name, email, domain...', 'Rechercher par nom, e-mail, domaine...', 'Buscar por nombre, correo, dominio...', 'Nach Name, E-Mail, Domain suchen...'],
  'outreach.filter': ['Filter contacts', 'Filtrer les contacts', 'Filtrar contactos', 'Kontakte filtern'],
  'outreach.threshold': ['Follow-up threshold: 5 days', 'Seuil de relance : 5 jours', 'Umbral de seguimiento: 5 días', 'Nachfass-Schwelle: 5 Tage'],
  'outreach.noFollowUp': ['No follow-up needed', 'Aucune relance nécessaire', 'Ningún seguimiento necesario', 'Kein Nachfassen nötig'],
  'outreach.noPending': ['No contact pending', 'Aucun contact en attente', 'Ningún contacto en espera', 'Kein Kontakt wartet'],
  'outreach.noReplies': ['No replies', 'Aucune réponse', 'Sin respuestas', 'Keine Antworten'],
  'outreach.goToLeads': ['Go to leads', 'Aller aux leads', 'Ir a los leads', 'Zu den Leads'],
  'outreach.emailsSent': [{ one: '{count} email sent', other: '{count} emails sent' }, { one: '{count} e-mail envoyé', other: '{count} e-mails envoyés' }, { one: '{count} correo enviado', other: '{count} correos enviados' }, { one: '{count} E-Mail gesendet', other: '{count} E-Mails gesendet' }],
  'outreach.fullProfile': ['Full profile', 'Profil complet', 'Perfil completo', 'Vollständiges Profil'],
  'outreach.sendFollowUp': ['Send a follow-up', 'Envoyer une relance', 'Enviar un seguimiento', 'Nachfassen senden'],
  'outreach.sendEmail': ['Send an email', 'Envoyer un e-mail', 'Enviar un correo', 'E-Mail senden']
} as const satisfies Record<string, Row>;
