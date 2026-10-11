import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({})),
  newId: () => "id",
  nowIso: () => "2026-01-01T00:00:00.000Z",
}));

import { invoke } from "@tauri-apps/api/core";
import { EXPORT_SCHEMA_VERSION, importAllData } from "../repositories";

function backup(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: "anna",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    tables: { personas: [{ id: "p1", name: "Anna" }] },
    ...extra,
  });
}

describe("importAllData", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("hands every table to the transactional import, in dependency order", async () => {
    await importAllData(backup());

    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = vi.mocked(invoke).mock.calls[0];
    expect(command).toBe("import_backup");
    const { tables, followUp } = args as {
      tables: { name: string; rows: unknown[] }[];
      followUp: string[];
    };
    const names = tables.map((t) => t.name);
    expect(names.indexOf("personas")).toBeLessThan(names.indexOf("messages"));
    expect(tables.find((t) => t.name === "personas")?.rows).toEqual([{ id: "p1", name: "Anna" }]);
    expect(tables.find((t) => t.name === "messages")?.rows).toEqual([]);
    expect(followUp.length).toBeGreaterThan(0);
  });

  it("refuses a backup from a newer version before touching the database", async () => {
    await expect(importAllData(backup({ schemaVersion: EXPORT_SCHEMA_VERSION + 1 }))).rejects.toThrow(
      "version plus récente",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses files that are not a backup", async () => {
    await expect(importAllData(JSON.stringify({ app: "other", tables: {} }))).rejects.toThrow();
    await expect(importAllData(JSON.stringify({ app: "anna", tables: [] }))).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses malformed rows", async () => {
    await expect(importAllData(backup({ tables: { personas: "nope" } }))).rejects.toThrow(
      "personas",
    );
    await expect(importAllData(backup({ tables: { personas: [["p1"]] } }))).rejects.toThrow(
      "personas",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("surfaces a failed import from Rust", async () => {
    vi.mocked(invoke).mockImplementation(async () => {
      throw new Error("Unknown column in backup: personas.x");
    });
    await expect(importAllData(backup())).rejects.toThrow("Unknown column in backup");
  });
});
