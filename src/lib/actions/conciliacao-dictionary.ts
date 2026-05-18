"use server";

import { db } from "../db";
import { buildDictionary } from "../queries/conciliacao-dictionary";

export async function exportDictionaryAction(): Promise<{
  filename: string;
  content: string;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const content = await buildDictionary(db as any, today);
  return {
    filename: `dicionario-clasen-${today}.md`,
    content,
  };
}
