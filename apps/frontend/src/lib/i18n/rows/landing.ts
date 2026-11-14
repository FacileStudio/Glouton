import type { Row } from './types';

export const landing = {
  'landing.featuresTitle': ['From the map to the inbox', "De la carte à la boîte mail", 'Del mapa a la bandeja de entrada', 'Von der Karte ins Postfach'],
  'landing.featuresText': [
    'Find, score, watch and write, in one app.',
    'Trouver, noter, surveiller et écrire, dans une seule app.',
    'Encontrar, puntuar, vigilar y escribir, en una sola app.',
    'Finden, bewerten, beobachten und schreiben, in einer App.'
  ],
  'landing.tiles.title': ['More than a hunt', "Plus qu'une chasse", 'Más que una búsqueda', 'Mehr als ein Suchlauf'],
  'landing.tiles.creations.title': ['New companies', 'Nouvelles entreprises', 'Empresas nuevas', 'Neue Unternehmen'],
  'landing.tiles.creations.body': [
    'Fresh registrations from the official registers, flagged when they have no website.',
    "Les immatriculations du jour, signalées quand elles n'ont pas de site.",
    'Los registros del día, marcados cuando no tienen sitio web.',
    'Neue Eintragungen aus den Registern, markiert, wenn die Website fehlt.'
  ],
  'landing.tiles.watch.title': ['Price changes', 'Changements de prix', 'Cambios de precio', 'Preisänderungen'],
  'landing.tiles.watch.body': [
    'Glouton watches competitor pages and sums up what changed.',
    'Glouton surveille les pages concurrentes et résume ce qui a changé.',
    'Glouton vigila las páginas de la competencia y resume lo que cambió.',
    'Glouton beobachtet Seiten der Konkurrenz und fasst Änderungen zusammen.'
  ],
  'landing.tiles.watch.summary': ['Starter plan up €10.', 'Offre Starter en hausse de 10 €.', 'El plan Starter sube 10 €.', 'Starter-Tarif 10 € teurer.'],
  'landing.tiles.bulle.title': ['First emails', 'Premiers e-mails', 'Primeros correos', 'Erste E-Mails'],
  'landing.tiles.bulle.body': [
    'Bulle drafts a first message to each lead, ready to send.',
    'Bulle rédige un premier message pour chaque piste, prêt à partir.',
    'Bulle redacta un primer mensaje para cada lead, listo para enviar.',
    'Bulle entwirft eine erste Nachricht an jeden Lead, bereit zum Senden.'
  ],
  'landing.tiles.bulle.subject': ['Your new website', 'Votre nouveau site', 'Tu nuevo sitio web', 'Ihre neue Website'],
  'landing.tiles.bulle.reply': [
    'Hello, I saw that Le Comptoir has no website yet. I build fast sites for restaurants in Lyon.',
    "Bonjour, j'ai vu que Le Comptoir n'a pas encore de site. Je crée des sites rapides pour les restaurants lyonnais.",
    'Hola, vi que Le Comptoir aún no tiene sitio web. Creo sitios rápidos para restaurantes de Lyon.',
    'Hallo, Le Comptoir hat noch keine Website. Ich baue schnelle Websites für Restaurants in Lyon.'
  ]
} as const satisfies Record<string, Row>;
