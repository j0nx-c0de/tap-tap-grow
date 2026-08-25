import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | undefined;

// Lazy singleton: never touches DATABASE_URL at module load, only when a
// request actually needs the database. Keeps `next build` safe to run
// before .env.local has real credentials in it.
export function getDb(): Db {
  if (!cached) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    }
    cached = drizzle(process.env.DATABASE_URL, { schema });
  }
  return cached;
}
