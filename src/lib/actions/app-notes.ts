"use server";

import { db } from "../db";
import {
  createAppNote,
  listAppNotes,
  updateAppNote,
  deleteAppNote,
  type AppNote,
  type AppNoteStatus,
} from "../services/app-notes";

export async function listAppNotesAction(
  status?: AppNoteStatus,
): Promise<AppNote[]> {
  return await listAppNotes(db as any, status ? { status } : undefined);
}

export async function createAppNoteAction(content: string): Promise<AppNote> {
  return await createAppNote(db as any, content);
}

export async function updateAppNoteAction(
  id: number,
  patch: { content?: string; status?: AppNoteStatus },
): Promise<AppNote> {
  return await updateAppNote(db as any, id, patch);
}

export async function deleteAppNoteAction(id: number): Promise<void> {
  await deleteAppNote(db as any, id);
}
