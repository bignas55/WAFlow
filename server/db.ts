import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema.js";

// Connection limit scales with environment:
// - Production: 100 connections (handles high concurrency with BullMQ workers)
// - Development: 10 connections (lighter footprint on local machine)
const connectionLimit = process.env.NODE_ENV === "production"
  ? Number(process.env.DB_CONNECTION_LIMIT ?? 100)
  : 10;

// Validate DATABASE_URL is set (required for all environments)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ FATAL: DATABASE_URL environment variable is not set");
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  console.warn("⚠️ Using default development database URL (localhost:3306)");
}

const pool = mysql.createPool({
  uri: databaseUrl || "mysql://waflow:waflow@localhost:3306/waflow",
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
  connectTimeout: 10_000,
  idleTimeout: 60_000,
});

export const db = drizzle(pool, { schema, mode: "default" });
export type Database = typeof db;
