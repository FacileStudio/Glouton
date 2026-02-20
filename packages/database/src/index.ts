import { SQL } from 'bun';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const db = new SQL(process.env.DATABASE_URL, {
  max: 40,
  idleTimeout: 20,
  connectionTimeout: 5,
});

export { db };
export { prisma } from './prisma';
export type {
  User,
  Session,
  Subscription,
  Verification,
  Contact,
  Media,
  Lead,
  EmailOutreach,
  HuntSession,
  AuditSession,
  Opportunity,
  Room,
  Message,
  RoomParticipant,
  PaymentHistory,
} from '@prisma/client';

export default db;
