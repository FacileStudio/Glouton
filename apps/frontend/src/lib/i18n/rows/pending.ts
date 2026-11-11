import type { Row } from './types';

export const pending = {
  'title.pending': ['Requests to confirm', 'Demandes à confirmer', 'Solicitudes por confirmar', 'Zu bestätigende Anfragen'],
  'pending.subtitle': [
    'An assistant connected to Glouton asked for these actions. Nothing happens until you confirm.',
    'Un assistant connecté à Glouton a demandé ces actions. Rien ne se passe tant que vous ne confirmez pas.',
    'Un asistente conectado a Glouton pidió estas acciones. No pasa nada hasta que confirmes.',
    'Ein mit Glouton verbundener Assistent hat diese Aktionen angefragt. Nichts passiert, bevor Sie bestätigen.'
  ],
  'pending.kind.delete_company': ['Delete a company', 'Supprimer une entreprise', 'Eliminar una empresa', 'Unternehmen löschen'],
  'pending.kind.delete_person': ['Delete a person', 'Supprimer une personne', 'Eliminar una persona', 'Person löschen'],
  'pending.kind.other': ['Action', 'Action', 'Acción', 'Aktion'],
  'pending.asked': ['Asked {date}', 'Demandé le {date}', 'Solicitado el {date}', 'Angefragt am {date}'],
  'pending.confirm': ['Confirm', 'Confirmer', 'Confirmar', 'Bestätigen'],
  'pending.dismiss': ['Dismiss', 'Ignorer', 'Descartar', 'Verwerfen'],
  'pending.confirmed': ['Done.', 'C’est fait.', 'Hecho.', 'Erledigt.'],
  'pending.dismissed': ['Request dismissed.', 'Demande ignorée.', 'Solicitud descartada.', 'Anfrage verworfen.'],
  'pending.state.changed': [
    'This item changed after the request. Dismiss it and ask the assistant again.',
    'Cet élément a changé depuis la demande. Ignorez-la et redemandez à l’assistant.',
    'Este elemento cambió después de la solicitud. Descártala y vuelve a pedírselo al asistente.',
    'Dieses Element hat sich seit der Anfrage geändert. Verwerfen Sie sie und fragen Sie den Assistenten erneut.'
  ],
  'pending.state.missing': [
    'This item no longer exists, or you no longer have access to it.',
    'Cet élément n’existe plus, ou vous n’y avez plus accès.',
    'Este elemento ya no existe o ya no tienes acceso.',
    'Dieses Element existiert nicht mehr, oder Sie haben keinen Zugriff mehr.'
  ],
  'pending.badge.ready': ['Waiting', 'En attente', 'En espera', 'Wartet'],
  'pending.badge.changed': ['Changed', 'Modifié', 'Modificado', 'Geändert'],
  'pending.badge.missing': ['Gone', 'Disparu', 'Desaparecido', 'Entfernt'],
  'pending.gone': [
    'This request was already confirmed, dismissed or has expired.',
    'Cette demande a déjà été confirmée, ignorée ou a expiré.',
    'Esta solicitud ya se confirmó, se descartó o caducó.',
    'Diese Anfrage wurde bereits bestätigt, verworfen oder ist abgelaufen.'
  ],
  'pending.none': ['Nothing to confirm', 'Rien à confirmer', 'Nada que confirmar', 'Nichts zu bestätigen'],
  'pending.noneText': [
    'When an assistant asks to delete something in Glouton, the request waits here.',
    'Quand un assistant demande de supprimer quelque chose dans Glouton, la demande attend ici.',
    'Cuando un asistente pide eliminar algo en Glouton, la solicitud espera aquí.',
    'Wenn ein Assistent etwas in Glouton löschen möchte, wartet die Anfrage hier.'
  ]
} as const satisfies Record<string, Row>;
