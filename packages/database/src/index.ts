import { SQL } from 'bun';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const db = new SQL(process.env.DATABASE_URL, {
  max: 20,
  idleTimeout: 30,
  connectionTimeout: 10,
});

export { db };

export default db;
