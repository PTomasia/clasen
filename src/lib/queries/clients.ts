import { db } from "../db";
import { getClientsList as getClientsListService } from "../services/clients";

// ─── Queries — leitura pura, usáveis em Server Components ──────────────────────

export async function getAllClients() {
  return await getClientsListService(db as any);
}
