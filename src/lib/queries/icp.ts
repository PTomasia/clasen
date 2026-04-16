import { db } from "../db";
import { getClientsList } from "../services/clients";
import type { ClientRow } from "../services/clients";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Distribution {
  label: string;
  count: number;
  percent: number;
  avgTicket: number | null;
}

export interface ICPData {
  totalClients: number;
  totalActive: number;
  byNiche: Distribution[];
  byCity: Distribution[];
  byState: Distribution[];
  byOffice: Distribution[];
  avgYearsInPractice: number | null;
  avgConsultaTicket: number | null;
  avgAge: number | null;
  avgTicketMensal: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDistribution(
  clients: ClientRow[],
  extractor: (c: ClientRow) => string | null | undefined
): Distribution[] {
  const groups = new Map<string, ClientRow[]>();

  for (const c of clients) {
    const label = extractor(c)?.trim() || null;
    if (!label) continue;
    const arr = groups.get(label) ?? [];
    arr.push(c);
    groups.set(label, arr);
  }

  const total = clients.length;

  return [...groups.entries()]
    .map(([label, members]) => {
      const withTicket = members.filter((m) => m.valorMensal > 0);
      return {
        label,
        count: members.length,
        percent: total > 0 ? Math.round((members.length / total) * 100) : 0,
        avgTicket:
          withTicket.length > 0
            ? withTicket.reduce((s, m) => s + m.valorMensal, 0) / withTicket.length
            : null,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ─── Query principal ──────────────────────────────────────────────────────────

export async function getICPData(): Promise<ICPData> {
  const allClients = await getClientsList(db as any);
  const active = allClients.filter((c) => c.status === "ativo");

  const currentYear = new Date().getFullYear();

  // Distribuições (sobre ativos)
  const byNiche = buildDistribution(active, (c) => c.niche);
  const byCity = buildDistribution(active, (c) => c.city);
  const byState = buildDistribution(active, (c) => c.state);
  const byOffice = buildDistribution(active, (c) =>
    c.hasPhysicalOffice === true ? "Com consultório" : c.hasPhysicalOffice === false ? "Sem consultório" : null
  );

  // Médias (sobre ativos que têm o dado)
  const years = active.filter((c) => c.yearsInPractice != null).map((c) => c.yearsInPractice!);
  const consultas = active.filter((c) => c.consultaTicket != null).map((c) => c.consultaTicket!);
  const ages = active.filter((c) => c.birthYear != null).map((c) => currentYear - c.birthYear!);
  const tickets = active.filter((c) => c.valorMensal > 0).map((c) => c.valorMensal);

  return {
    totalClients: allClients.length,
    totalActive: active.length,
    byNiche,
    byCity,
    byState,
    byOffice,
    avgYearsInPractice: avg(years),
    avgConsultaTicket: avg(consultas),
    avgAge: avg(ages),
    avgTicketMensal: avg(tickets),
  };
}
