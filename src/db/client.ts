import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "./auth-schema";
import { databaseUrl } from "./config";
import * as schema from "./schema";

const createClient = () => {
  const sql = postgres(databaseUrl().href, { max: 10 });
  return { sql, db: drizzle(sql, { schema: { ...schema, ...authSchema } }) };
};

let client: ReturnType<typeof createClient> | undefined;

// Keep build-time imports disconnected. Validate configuration when the first query needs a client.
export function getDatabase() {
  client ??= createClient();
  return client;
}

export type Db = ReturnType<typeof getDatabase>["db"];
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
