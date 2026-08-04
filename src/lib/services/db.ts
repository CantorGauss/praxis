import Database from "@tauri-apps/plugin-sql";

let instance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!instance) {
    instance = await Database.load("sqlite:praxis.db");
    await instance.execute("PRAGMA foreign_keys = ON;");
  }
  return instance;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
