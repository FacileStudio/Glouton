import { SQL } from 'bun';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const db = new SQL(process.env.DATABASE_URL);

export { db };

export default db;
