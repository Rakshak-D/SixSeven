import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "./auth-schema";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate";

/** Raw postgres.js client, for the few queries Drizzle can't express (e.g. the guarded stock UPDATE). */
export const sql = postgres(url, { max: 10 });
export const db = drizzle(sql, { schema: { ...schema, ...authSchema } });
export type Db = typeof db;
