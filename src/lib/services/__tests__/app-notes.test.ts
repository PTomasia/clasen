import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";

import {
  createAppNote,
  listAppNotes,
  updateAppNote,
  deleteAppNote,
} from "../app-notes";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE app_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

describe("createAppNote", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("cria anotação com status pending e retorna a row", async () => {
    const note = await createAppNote(db, "melhorar contraste do botão salvar");

    expect(note.id).toBeGreaterThan(0);
    expect(note.content).toBe("melhorar contraste do botão salvar");
    expect(note.status).toBe("pending");
    expect(note.createdAt).toBeTruthy();
    expect(note.updatedAt).toBeTruthy();
  });

  it("faz trim do conteúdo antes de salvar", async () => {
    const note = await createAppNote(db, "   espaços extras   ");
    expect(note.content).toBe("espaços extras");
  });

  it("rejeita conteúdo vazio", async () => {
    await expect(createAppNote(db, "")).rejects.toThrow();
  });

  it("rejeita conteúdo só com espaços", async () => {
    await expect(createAppNote(db, "    ")).rejects.toThrow();
  });
});

describe("listAppNotes", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("retorna lista vazia quando não há anotações", async () => {
    const notes = await listAppNotes(db);
    expect(notes).toHaveLength(0);
  });

  it("retorna anotações em ordem decrescente de createdAt", async () => {
    const first = await createAppNote(db, "primeira");
    // Garante created_at diferente (datetime tem precisão de segundos)
    await new Promise((r) => setTimeout(r, 1100));
    const second = await createAppNote(db, "segunda");

    const notes = await listAppNotes(db);

    expect(notes).toHaveLength(2);
    expect(notes[0].id).toBe(second.id);
    expect(notes[1].id).toBe(first.id);
  });

  it("filtra por status pending", async () => {
    const a = await createAppNote(db, "ainda fazer");
    const b = await createAppNote(db, "feita");
    await updateAppNote(db, b.id, { status: "done" });

    const pending = await listAppNotes(db, { status: "pending" });

    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(a.id);
  });

  it("filtra por status done", async () => {
    await createAppNote(db, "pendente");
    const b = await createAppNote(db, "feita");
    await updateAppNote(db, b.id, { status: "done" });

    const done = await listAppNotes(db, { status: "done" });

    expect(done).toHaveLength(1);
    expect(done[0].id).toBe(b.id);
  });

  it("sem filtro retorna todas (pending + done)", async () => {
    const a = await createAppNote(db, "uma");
    const b = await createAppNote(db, "duas");
    await updateAppNote(db, b.id, { status: "done" });

    const all = await listAppNotes(db);

    expect(all).toHaveLength(2);
    expect(all.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("updateAppNote", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("atualiza apenas o conteúdo", async () => {
    const note = await createAppNote(db, "original");

    const updated = await updateAppNote(db, note.id, { content: "editado" });

    expect(updated.content).toBe("editado");
    expect(updated.status).toBe("pending");
  });

  it("atualiza apenas o status", async () => {
    const note = await createAppNote(db, "marca como feito");

    const updated = await updateAppNote(db, note.id, { status: "done" });

    expect(updated.status).toBe("done");
    expect(updated.content).toBe("marca como feito");
  });

  it("bump em updatedAt ao atualizar", async () => {
    const note = await createAppNote(db, "abc");
    await new Promise((r) => setTimeout(r, 1100));

    const updated = await updateAppNote(db, note.id, { content: "abc edit" });

    expect(updated.updatedAt > note.updatedAt).toBe(true);
  });

  it("faz trim do conteúdo ao atualizar", async () => {
    const note = await createAppNote(db, "abc");
    const updated = await updateAppNote(db, note.id, { content: "   novo   " });
    expect(updated.content).toBe("novo");
  });

  it("rejeita conteúdo vazio na atualização", async () => {
    const note = await createAppNote(db, "abc");
    await expect(
      updateAppNote(db, note.id, { content: "   " }),
    ).rejects.toThrow();
  });

  it("lança erro quando id não existe", async () => {
    await expect(
      updateAppNote(db, 9999, { content: "qualquer" }),
    ).rejects.toThrow();
  });

  it("rejeita status inválido", async () => {
    const note = await createAppNote(db, "abc");
    await expect(
      // @ts-expect-error testando runtime
      updateAppNote(db, note.id, { status: "outra-coisa" }),
    ).rejects.toThrow();
  });
});

describe("deleteAppNote", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("remove a anotação", async () => {
    const note = await createAppNote(db, "vai apagar");
    await deleteAppNote(db, note.id);
    const all = await listAppNotes(db);
    expect(all).toHaveLength(0);
  });

  it("lança erro quando id não existe", async () => {
    await expect(deleteAppNote(db, 9999)).rejects.toThrow();
  });
});
