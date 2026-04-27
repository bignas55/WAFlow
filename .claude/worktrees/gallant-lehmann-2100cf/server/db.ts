import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema.js";

// Connection limit scales with environment:
// - Production: 100 connections (handles high concurrency with BullMQ workers)
// - Development: 10 connections (lighter footprint on local machine)
const connectionLimit = process.env.NODE_ENV === "production"
  ? Number(process.env.DB_CONNECTION_LIMIT ?? 100)
  : 10;

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL || "mysql://waflow:waflow_password@localhost:3306/waflow",
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
  connectTimeout: 10_000,
  idleTimeout: 60_000,
});

export const db = drizzle(pool, { schema, mode: "default" });
export type Database = typeof db;
