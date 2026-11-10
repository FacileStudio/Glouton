import type { Row } from './types';

export const ideas = {
  'ideas.description': [
    'Bulle reads your leads, competitors and hunts and suggests what to do next. Run an idea and it is done here.',
    'Bulle lit vos prospects, concurrents et chasses et propose quoi faire ensuite. Lancez une idée, elle se fait ici.',
    'Bulle lee tus prospectos, competidores y búsquedas y propone qué hacer después. Lanza una idea y se hace aquí.',
    'Bulle liest Ihre Interessenten, Wettbewerber und Suchläufe und schlägt den nächsten Schritt vor. Starten Sie eine Idee, sie wird hier erledigt.'
  ],
  'ideas.approval.summary': [
    'Bulle wants to run "{tool}". Check it before it goes ahead.',
    'Bulle veut lancer « {tool} ». Vérifiez avant de continuer.',
    'Bulle quiere ejecutar «{tool}». Revísalo antes de seguir.',
    'Bulle möchte „{tool}“ ausführen. Prüfen Sie es, bevor es weitergeht.'
  ],
  'ideas.tool.glouton_save_draft': ['Save a draft', 'Enregistrer un brouillon', 'Guardar un borrador', 'Entwurf speichern'],
  'ideas.tool.glouton_update_draft': ['Update a draft', 'Modifier un brouillon', 'Editar un borrador', 'Entwurf ändern'],
  'ideas.tool.glouton_suggest': ['Add a suggestion', 'Ajouter une suggestion', 'Añadir una sugerencia', 'Vorschlag hinzufügen'],
  'ideas.tool.glouton_create_company': ['Create a company', 'Créer une entreprise', 'Crear una empresa', 'Unternehmen anlegen'],
  'ideas.tool.glouton_update_company': ['Update a company', 'Modifier une entreprise', 'Editar una empresa', 'Unternehmen ändern'],
  'ideas.tool.glouton_create_person': ['Create a contact', 'Créer un contact', 'Crear un contacto', 'Kontakt anlegen'],
  'ideas.tool.glouton_update_person': ['Update a contact', 'Modifier un contact', 'Editar un contacto', 'Kontakt ändern'],
  'ideas.error.load': ['Could not load the ideas.', 'Impossible de charger les idées.', 'No se pudieron cargar las ideas.', 'Die Ideen konnten nicht geladen werden.'],
  'ideas.error.unreachable': [
    'Bulle is unreachable for now. Try again in a moment.',
    'Bulle est injoignable pour le moment. Réessayez dans un instant.',
    'Bulle no responde por ahora. Inténtalo en un momento.',
    'Bulle ist gerade nicht erreichbar. Versuchen Sie es gleich noch einmal.'
  ],
  'ideas.error.notLinked': [
    'Reconnect your Facile account to use Bulle.',
    'Reconnectez votre compte Facile pour utiliser Bulle.',
    'Vuelve a conectar tu cuenta Facile para usar Bulle.',
    'Verbinden Sie Ihr Facile-Konto erneut, um Bulle zu nutzen.'
  ],
  'ideas.error.capped': [
    'You asked for ideas three times today. More come tomorrow.',
    'Vous avez demandé des idées trois fois aujourd’hui. D’autres arrivent demain.',
    'Ya pediste ideas tres veces hoy. Mañana llegan más.',
    'Sie haben heute dreimal nach Ideen gefragt. Morgen kommen neue.'
  ],
  'ideas.error.busy': [
    'Bulle is already thinking of ideas for this space.',
    'Bulle cherche déjà des idées pour cet espace.',
    'Bulle ya está buscando ideas para este espacio.',
    'Bulle sucht bereits Ideen für diesen Bereich.'
  ],
  'ideas.error.gone': [
    'This idea is no longer available.',
    'Cette idée n’est plus disponible.',
    'Esta idea ya no está disponible.',
    'Diese Idee ist nicht mehr verfügbar.'
  ],
  'ideas.error.run': ['The run stopped before the end.', 'L’exécution s’est arrêtée avant la fin.', 'La ejecución se detuvo antes del final.', 'Der Lauf wurde vor dem Ende abgebrochen.'],
  'ideas.example.lead.title': ['Follow up Boulangerie Martin', 'Relancer la Boulangerie Martin', 'Volver a contactar a Boulangerie Martin', 'Bei Boulangerie Martin nachfassen'],
  'ideas.example.lead.why': [
    'They opened your mail twice this week and have not answered. A short reply draft is ready.',
    'Ils ont ouvert votre mail deux fois cette semaine sans répondre. Un court brouillon de relance est prêt.',
    'Abrieron tu correo dos veces esta semana sin responder. Hay un borrador breve listo.',
    'Sie haben Ihre Mail diese Woche zweimal geöffnet und nicht geantwortet. Ein kurzer Entwurf liegt bereit.'
  ],
  'ideas.example.competitor.title': ['Answer Rival’s new prices', 'Répondre aux nouveaux prix de Rival', 'Responder a los nuevos precios de Rival', 'Auf die neuen Preise von Rival reagieren'],
  'ideas.example.competitor.why': [
    'Rival dropped its starter offer to 39 €. Three of your warm leads compared you with them.',
    'Rival a baissé son offre de départ à 39 €. Trois de vos prospects chauds vous ont comparé à lui.',
    'Rival bajó su oferta inicial a 39 €. Tres de tus prospectos calientes os compararon.',
    'Rival hat sein Einstiegsangebot auf 39 € gesenkt. Drei Ihrer warmen Interessenten haben verglichen.'
  ],
  'ideas.example.segment.title': ['Hunt bakeries in Lyon', 'Chasser les boulangeries de Lyon', 'Buscar panaderías en Lyon', 'Bäckereien in Lyon suchen'],
  'ideas.example.segment.why': [
    'Your best leads cluster in bakeries, and you have never hunted in Lyon.',
    'Vos meilleurs prospects sont des boulangeries, et vous n’avez jamais chassé à Lyon.',
    'Tus mejores prospectos son panaderías y nunca has buscado en Lyon.',
    'Ihre besten Interessenten sind Bäckereien, und in Lyon haben Sie noch nie gesucht.'
  ],
  'ideas.dismissed': ['Idea dismissed', 'Idée écartée', 'Idea descartada', 'Idee verworfen'],
  'title.ideas': ['Ideas', 'Idées', 'Ideas', 'Ideen']
} as const satisfies Record<string, Row>;
