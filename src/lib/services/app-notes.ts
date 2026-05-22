import { desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";

export type AppNoteStatus = "pending" | "done";
export type AppNote = typeof schema.appNotes.$inferSelect;

const VALID_STATUSES: AppNoteStatus[] = ["pending", "done"];

export async function createAppNote(
  db: any,
  content: string,
): Promise<AppNote> {
  const normalized = content.trim();
  if (!normalized) throw new Error("conteúdo da anotação é obrigatório");

  return await db
    .insert(schema.appNotes)
    .values({ content: normalized })
    .returning()
    .get();
}

export async function listAppNotes(
  db: any,
  options?: { status?: AppNoteStatus },
): Promise<AppNote[]> {
  const query = db.select().from(schema.appNotes);

  if (options?.status) {
    query.where(eq(schema.appNotes.status, options.status));
  }

  return await query.orderBy(desc(schema.appNotes.createdAt)).all();
}

export async function updateAppNote(
  db: any,
  id: number,
  patch: { content?: string; status?: AppNoteStatus },
): Promise<AppNote> {
  const existing = await db
    .select()
    .from(schema.appNotes)
    .where(eq(schema.appNotes.id, id))
    .get();

  if (!existing) throw new Error("anotação não encontrada");

  const values: Record<string, unknown> = {
    updatedAt: sql`(datetime('now'))`,
  };

  if (patch.content !== undefined) {
    const normalized = patch.content.trim();
    if (!normalized) throw new Error("conteúdo da anotação é obrigatório");
    values.content = normalized;
  }

  if (patch.status !== undefined) {
    if (!VALID_STATUSES.includes(patch.status)) {
      throw new Error("status inválido");
    }
    values.status = patch.status;
  }

  return await db
    .update(schema.appNotes)
    .set(values)
    .where(eq(schema.appNotes.id, id))
    .returning()
    .get();
}

export async function deleteAppNote(db: any, id: number): Promise<void> {
  const existing = await db
    .select()
    .from(schema.appNotes)
    .where(eq(schema.appNotes.id, id))
    .get();

  if (!existing) throw new Error("anotação não encontrada");

  await db.delete(schema.appNotes).where(eq(schema.appNotes.id, id)).run();
}
