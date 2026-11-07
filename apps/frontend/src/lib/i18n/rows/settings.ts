import type { Row } from './types';

export const settings = {
  'settings.mail.nav': ['Mail', 'Messagerie', 'Correo', 'E-Mail'],
  'settings.advanced.nav': ['Advanced', 'Avancé', 'Avanzado', 'Erweitert'],
  'settings.subscription.none': ['None', 'Aucun', 'Ninguno', 'Keiner'],
  'settings.subscription.description': [
    'Glouton is included in the Pro and Studio plans.',
    'Glouton est inclus dans les offres Pro et Studio.',
    'Glouton está incluido en los planes Pro y Studio.',
    'Glouton ist in den Tarifen Pro und Studio enthalten.'
  ],
  'settings.smtp.title': ['Mail server', 'Serveur mail', 'Servidor de correo', 'Mailserver'],
  'settings.smtp.description': [
    'Set up your SMTP server to send prospecting emails',
    "Configurez votre serveur SMTP pour l'envoi d'emails de prospection",
    'Configura tu servidor SMTP para enviar correos de prospección',
    'Richten Sie Ihren SMTP-Server für den Versand von Akquise-E-Mails ein'
  ],
  'settings.smtp.test': ['Test the configuration', 'Tester la configuration', 'Probar la configuración', 'Konfiguration testen'],
  'settings.smtp.testing': ['Testing...', 'Test en cours...', 'Probando...', 'Test läuft...'],
  'settings.smtp.host': ['SMTP host', 'Hôte SMTP', 'Host SMTP', 'SMTP-Host'],
  'settings.smtp.port': ['SMTP port', 'Port SMTP', 'Puerto SMTP', 'SMTP-Port'],
  'settings.smtp.secure': ['Use SSL/TLS (port 465)', 'Utiliser SSL/TLS (port 465)', 'Usar SSL/TLS (puerto 465)', 'SSL/TLS verwenden (Port 465)'],
  'settings.smtp.secureHint': [
    'Turn this on if you use port 465 with SSL/TLS',
    'Activez cette option si vous utilisez le port 465 avec SSL/TLS',
    'Actívalo si usas el puerto 465 con SSL/TLS',
    'Aktivieren Sie dies, wenn Sie Port 465 mit SSL/TLS nutzen'
  ],
  'settings.smtp.user': ['SMTP username', "Nom d'utilisateur SMTP", 'Usuario SMTP', 'SMTP-Benutzername'],
  'settings.smtp.userPlaceholder': ['you@example.com', 'votre@email.com', 'tu@correo.com', 'sie@beispiel.de'],
  'settings.smtp.password': ['SMTP password', 'Mot de passe SMTP', 'Contraseña SMTP', 'SMTP-Passwort'],
  'settings.smtp.showPassword': ['Show the SMTP password', 'Afficher le mot de passe SMTP', 'Mostrar la contraseña SMTP', 'SMTP-Passwort anzeigen'],
  'settings.smtp.hidePassword': ['Hide the SMTP password', 'Masquer le mot de passe SMTP', 'Ocultar la contraseña SMTP', 'SMTP-Passwort verbergen'],
  'settings.smtp.fromName': ['Sender name', "Nom de l'expéditeur", 'Nombre del remitente', 'Absendername'],
  'settings.smtp.fromNamePlaceholder': ['Your Name', 'Votre Nom', 'Tu nombre', 'Ihr Name'],
  'settings.smtp.fromEmail': ['Sender email', "Email de l'expéditeur", 'Correo del remitente', 'Absender-E-Mail'],
  'settings.smtp.fillAll': ['Fill in every SMTP field', 'Veuillez remplir tous les champs SMTP', 'Rellena todos los campos SMTP', 'Bitte füllen Sie alle SMTP-Felder aus'],
  'settings.smtp.valid': ['SMTP configuration is valid!', 'Configuration SMTP valide !', '¡La configuración SMTP es válida!', 'SMTP-Konfiguration ist gültig!'],
  'settings.smtp.invalid': ['Invalid SMTP configuration', 'Configuration SMTP invalide', 'Configuración SMTP no válida', 'Ungültige SMTP-Konfiguration'],
  'settings.smtp.saved': ['SMTP configuration saved!', 'Configuration SMTP enregistrée avec succès !', '¡Configuración SMTP guardada!', 'SMTP-Konfiguration gespeichert!'],
  'settings.smtp.saveFailed': ['Could not update the SMTP configuration', 'Échec de la mise à jour de la config SMTP', 'No se pudo actualizar la configuración SMTP', 'SMTP-Konfiguration konnte nicht aktualisiert werden'],
  'settings.delete.label': ['Delete account', 'Supprimer le compte', 'Eliminar la cuenta', 'Konto löschen'],
  'settings.delete.description': [
    'Deleting your account is final. All your data is erased immediately and cannot be recovered.',
    'La suppression de votre compte est définitive. Toutes vos données seront effacées immédiatement et ne pourront pas être récupérées.',
    'Eliminar tu cuenta es definitivo. Todos tus datos se borran de inmediato y no se pueden recuperar.',
    'Das Löschen Ihres Kontos ist endgültig. Alle Ihre Daten werden sofort gelöscht und lassen sich nicht wiederherstellen.'
  ],
  'settings.delete.deleting': ['Deleting...', 'Suppression...', 'Eliminando...', 'Wird gelöscht...'],
  'settings.delete.failed': ['Failed to delete account', 'Échec de la suppression du compte', 'No se pudo eliminar la cuenta', 'Konto konnte nicht gelöscht werden'],
  'settings.delete.title': ['Delete the account?', 'Supprimer le compte ?', '¿Eliminar la cuenta?', 'Konto löschen?'],
  'settings.delete.body': [
    'This cannot be undone. Your data will be permanently deleted.',
    'Cette action est définitive. Vos données seront supprimées de façon permanente.',
    'Esta acción es definitiva. Tus datos se eliminarán de forma permanente.',
    'Diese Aktion ist endgültig. Ihre Daten werden dauerhaft gelöscht.'
  ],
  'settings.delete.typeToConfirm': ['Type "DELETE" to confirm', 'Tapez "DELETE" pour confirmer', 'Escribe "DELETE" para confirmar', 'Geben Sie zur Bestätigung "DELETE" ein'],
  'settings.subscription.gloutonAccess': ['Glouton access', 'Accès à Glouton', 'Acceso a Glouton', 'Zugang zu Glouton'],
  'settings.subscription.aiAccess': ['Assistant and AI features', 'Assistant et fonctions IA', 'Asistente y funciones de IA', 'Assistent und KI-Funktionen'],
  'settings.subscription.included': ['Included', 'Inclus', 'Incluido', 'Enthalten'],
  'settings.subscription.notIncluded': ['Not included', 'Non inclus', 'No incluido', 'Nicht enthalten']
} as const satisfies Record<string, Row>;
