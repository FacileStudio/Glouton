import { teams2 } from './rows/teams2';
import { teams } from './rows/teams';
import { creations } from './rows/creations';
import { missions } from './rows/missions';
import { outreach } from './rows/outreach';
import { composer } from './rows/composer';
import { contacts } from './rows/contacts';
import { leads2 } from './rows/leads2';
import { leads } from './rows/leads';
import type { Row } from './rows/types';
import { hunts2 } from './rows/hunts2';
import { hunts } from './rows/hunts';
import { assistant } from './rows/assistant';
import { common } from './rows/common';
import { settings } from './rows/settings';
import { competitors } from './rows/competitors';
import { watch } from './rows/watch';
import { schedules } from './rows/schedules';
import { discovery } from './rows/discovery';
import { webhooks } from './rows/webhooks';
import { competitorAi } from './rows/competitor-ai';
import { profile } from './rows/profile';
import { ideas } from './rows/ideas';
import { job } from './rows/job';
import { pending } from './rows/pending';
import { landing } from './rows/landing';

const base = {
  'app.name': ['Glouton', 'Glouton', 'Glouton', 'Glouton'],
  'auth.error.unverified_account': [
    'An unverified Glouton account already uses this address. Ask an administrator to verify it, then sign in again.',
    "Un compte Glouton non vérifié utilise déjà cette adresse. Demandez à un administrateur de le vérifier, puis reconnectez-vous.",
    'Una cuenta de Glouton sin verificar ya usa esta dirección. Pide a un administrador que la verifique y vuelve a iniciar sesión.',
    'Ein nicht verifiziertes Glouton-Konto nutzt diese Adresse bereits. Bitten Sie einen Administrator um die Bestätigung und melden Sie sich erneut an.'
  ],
  'auth.error.email_unverified': [
    'Your Facile email address is not verified yet. Verify it in Facile, then sign in again.',
    "Votre adresse e-mail Facile n'est pas encore vérifiée. Vérifiez-la dans Facile, puis reconnectez-vous.",
    'Tu correo de Facile aún no está verificado. Verifícalo en Facile y vuelve a iniciar sesión.',
    'Ihre Facile-E-Mail-Adresse ist noch nicht bestätigt. Bestätigen Sie sie in Facile und melden Sie sich erneut an.'
  ],
  'auth.error.identity_conflict': [
    'This Glouton account is already linked to another Facile identity.',
    'Ce compte Glouton est déjà lié à une autre identité Facile.',
    'Esta cuenta de Glouton ya está vinculada a otra identidad de Facile.',
    'Dieses Glouton-Konto ist bereits mit einer anderen Facile-Identität verknüpft.'
  ],
  'auth.error.sso_failed': ['Signing in with Facile failed. Try again.', 'La connexion avec Facile a échoué. Réessayez.', 'No se pudo iniciar sesión con Facile. Inténtalo de nuevo.', 'Die Anmeldung mit Facile ist fehlgeschlagen. Versuchen Sie es erneut.'],
  'auth.callback.failed': ['Sign-in failed. Please try again.', 'Connexion SSO échouée. Veuillez réessayer.', 'Error al iniciar sesión. Inténtalo de nuevo.', 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.'],
  'auth.callback.back': ['Back to sign-in', 'Retour à la connexion', 'Volver al inicio de sesión', 'Zurück zur Anmeldung'],
  'auth.callback.progress': ['Signing you in…', 'Connexion en cours…', 'Iniciando sesión…', 'Anmeldung läuft…'],
  'error.label': ['Error {status}', 'Erreur {status}', 'Error {status}', 'Fehler {status}'],
  'error.404.title': ['Page not found', 'Page introuvable', 'Página no encontrada', 'Seite nicht gefunden'],
  'error.404.text': ['The page does not exist or has moved.', "La page demandée n'existe pas ou a été déplacée.", 'La página no existe o se ha movido.', 'Die Seite existiert nicht oder wurde verschoben.'],
  'error.500.title': ['Internal error', 'Erreur interne', 'Error interno', 'Interner Fehler'],
  'error.500.text': ['Our servers are having trouble. Try again in a moment.', 'Nos serveurs rencontrent un souci. Réessayez dans quelques instants.', 'Nuestros servidores tienen un problema. Inténtalo de nuevo en unos instantes.', 'Unsere Server haben ein Problem. Versuchen Sie es gleich noch einmal.'],
  'error.other.title': ['Something went wrong', 'Une erreur est survenue', 'Ha ocurrido un error', 'Etwas ist schiefgelaufen'],
  'error.home': ['Home', 'Accueil', 'Inicio', 'Startseite'],
  'error.back': ['Back', 'Retour', 'Volver', 'Zurück'],
  'nav.hunts': ['Hunts', 'Chasses', 'Búsquedas', 'Suchläufe'],
  'nav.contacts': ['Contacts', 'Contacts', 'Contactos', 'Kontakte'],
  'nav.inbox': ['Agent inbox', 'Boîte agent', 'Bandeja del agente', 'Agent-Posteingang'],
  'nav.leads': ['Leads', 'Leads', 'Leads', 'Leads'],
  'nav.creations': ['Creations', 'Créations', 'Creaciones', 'Gründungen'],
  'nav.missions': ['Missions', 'Missions', 'Misiones', 'Aufträge'],
  'nav.outreach': ['Outreach', 'Prospection', 'Prospección', 'Akquise'],
  'nav.spaces': ['Spaces', 'Espaces', 'Espacios', 'Bereiche'],
  'nav.personal': ['Personal', 'Personnel', 'Personal', 'Persönlich'],
  'nav.manageSpaces': ['Manage spaces', 'Gérer les espaces', 'Gestionar espacios', 'Bereiche verwalten'],
  'nav.spacesFailed': ['Could not load spaces', 'Échec du chargement des espaces', 'No se pudieron cargar los espacios', 'Bereiche konnten nicht geladen werden'],
  'title.newHunt': ['New hunt', 'Nouvelle chasse', 'Nueva búsqueda', 'Neuer Suchlauf'],
  'title.hunt': ['Hunt', 'Chasse', 'Búsqueda', 'Suchlauf'],
  'title.lead': ['Lead', 'Lead', 'Lead', 'Lead'],
  'title.company': ['Company', 'Entreprise', 'Empresa', 'Unternehmen'],
  'title.person': ['Person', 'Personne', 'Persona', 'Person'],
  'title.newSpace': ['New space', 'Nouvel espace', 'Nuevo espacio', 'Neuer Bereich'],
  'title.spaceSettings': ['Space settings', "Paramètres d'espace", 'Ajustes del espacio', 'Bereichseinstellungen'],
  'title.members': ['Members', 'Membres', 'Miembros', 'Mitglieder'],
  'title.space': ['Space', 'Espace', 'Espacio', 'Bereich'],
  'title.settings': ['Settings', 'Paramètres', 'Ajustes', 'Einstellungen'],
  'title.plan': ['Plan', 'Forfait', 'Plan', 'Tarif'],
  'paywall.title': ['Plan required', 'Forfait requis', 'Plan necesario', 'Tarif erforderlich'],
  'paywall.subtitle': ['Glouton is part of the Pro and Studio plans', 'Glouton fait partie des forfaits Pro et Studio', 'Glouton forma parte de los planes Pro y Studio', 'Glouton gehört zu den Tarifen Pro und Studio'],
  'paywall.yourSpace': ['your personal space', 'votre espace personnel', 'tu espacio personal', 'Ihr persönlicher Bereich'],
  'paywall.included': ["{scope}'s plan includes Glouton.", 'Le forfait de {scope} inclut Glouton.', 'El plan de {scope} incluye Glouton.', 'Der Tarif von {scope} enthält Glouton.'],
  'paywall.backToApp': ['Back to Glouton', 'Retour à Glouton', 'Volver a Glouton', 'Zurück zu Glouton'],
  'paywall.notIncluded': [
    "Glouton is included in the Pro and Studio plans. {scope}'s plan does not include it yet.",
    "Glouton est inclus dans les forfaits Pro et Studio. Le forfait de {scope} ne l'inclut pas encore.",
    'Glouton está incluido en los planes Pro y Studio. El plan de {scope} aún no lo incluye.',
    'Glouton ist in den Tarifen Pro und Studio enthalten. Der Tarif von {scope} enthält es noch nicht.'
  ],
  'paywall.kept': [
    'Your leads, contacts and hunts are kept: nothing is deleted. A space owner can change plan in Registre, or you can switch to a space that includes Glouton.',
    "Vos leads, contacts et chasses sont conservés : rien n'est supprimé. Un propriétaire de l'espace peut changer de forfait dans Registre, ou vous pouvez basculer vers un espace qui inclut Glouton.",
    'Tus leads, contactos y búsquedas se conservan: no se borra nada. Un propietario del espacio puede cambiar de plan en Registre, o puedes pasar a un espacio que incluya Glouton.',
    'Ihre Leads, Kontakte und Suchläufe bleiben erhalten: nichts wird gelöscht. Ein Bereichsinhaber kann den Tarif in Registre ändern, oder Sie wechseln zu einem Bereich mit Glouton.'
  ],
  'paywall.seePlans': ['See plans', 'Voir les forfaits', 'Ver planes', 'Tarife ansehen'],
  'paywall.loadFailed': ['Could not load the link to the plans. Try again later.', 'Impossible de charger le lien vers les forfaits. Réessayez plus tard.', 'No se pudo cargar el enlace a los planes. Inténtalo más tarde.', 'Der Link zu den Tarifen konnte nicht geladen werden. Versuchen Sie es später erneut.']
} as const satisfies Record<string, Row>;

export const rows = { ...base, ...common, ...settings, ...assistant, ...hunts, ...hunts2, ...leads, ...leads2, ...contacts, ...composer, ...outreach, ...missions, ...creations, ...teams, ...teams2, ...competitors, ...watch, ...schedules, ...discovery, ...webhooks, ...competitorAi, ...profile, ...ideas, ...job, ...pending, ...landing };

export type Key = keyof typeof rows;
