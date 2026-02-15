import { db, EventLevel } from '@repo/database';
import { logger } from '@repo/logger/server';

export type SessionType = 'HUNT' | 'AUDIT';

export interface LogEventOptions {
	sessionId: string;
	sessionType: SessionType;
	level: EventLevel;
	category: string;
	message: string;
	metadata?: Record<string, unknown>;
}

/**
 * logEvent
 */
export async function logEvent(options: LogEventOptions): Promise<void> {
	const { sessionId, sessionType, level, category, message, metadata } = options;

	const logPrefix = sessionType === 'HUNT' ? '[HUNT]' : '[AUDIT]';
	const formattedMessage = `${logPrefix} [${category}] ${message}`;

	/**
	 * switch
	 */
	switch (level) {
		case 'INFO':
			logger.info(formattedMessage, metadata);
			break;
		case 'WARN':
			logger.warn(formattedMessage, metadata);
			break;
		case 'ERROR':
			logger.error(formattedMessage, metadata);
			break;
		case 'SUCCESS':
			logger.info(formattedMessage, metadata);
			break;
	}

	/**
	 * if
	 */
	if (sessionType === 'HUNT') {
		try {
			await db.huntSessionEvent.create({
				data: {
					huntSessionId: sessionId,
					level,
					category,
					message,
					metadata: metadata || null,
				},
			});
		} catch (error) {
			/**
			 * if
			 */
			if (error instanceof Error && error.message.includes('Foreign key constraint')) {
				logger.warn(`${logPrefix} Session ${sessionId} not found, skipping event logging`);
			} else {
				throw error;
			}
		}
	}
}

/**
 * createEventLogger
 */
export function createEventLogger(sessionId: string, sessionType: SessionType) {
	return {
		info: (category: string, message: string, metadata?: Record<string, unknown>) =>
			/**
			 * logEvent
			 */
			logEvent({ sessionId, sessionType, level: 'INFO', category, message, metadata }),
		warn: (category: string, message: string, metadata?: Record<string, unknown>) =>
			/**
			 * logEvent
			 */
			logEvent({ sessionId, sessionType, level: 'WARN', category, message, metadata }),
		error: (category: string, message: string, metadata?: Record<string, unknown>) =>
			/**
			 * logEvent
			 */
			logEvent({ sessionId, sessionType, level: 'ERROR', category, message, metadata }),
		success: (category: string, message: string, metadata?: Record<string, unknown>) =>
			/**
			 * logEvent
			 */
			logEvent({ sessionId, sessionType, level: 'SUCCESS', category, message, metadata }),
	};
}
