// ─── Export de pagamentos atrasados ────────────────────────────────────────────
// Transforma OverdueRow[] em texto pronto pro clipboard:
//   - buildOverdueMarkdown: pra colar no ChatGPT e cruzar com o extrato bancário
//   - buildOverdueWhatsApp: texto simples pra sócia saber quem cobrar
// Funções puras (sem acesso a DB/clipboard) → testáveis.

import { formatBRL, formatDate } from "./formatting";
import type { OverdueRow } from "./overdue";

interface ClientGroup {
  clientName: string;
  planType: string;
  rowValue: number;
  dueDates: string[];
  maxDiasAtraso: number;
}

/** Agrupa as linhas (1 por vencimento) por plano, preservando a ordem de entrada. */
function groupByPlan(rows: ReadonlyArray<OverdueRow>): ClientGroup[] {
  const map = new Map<number, ClientGroup>();
  const order: number[] = [];
  for (const row of rows) {
    let g = map.get(row.planId);
    if (!g) {
      g = {
        clientName: row.clientName,
        planType: row.planType,
        rowValue: row.rowValue,
        dueDates: [],
        maxDiasAtraso: 0,
      };
      map.set(row.planId, g);
      order.push(row.planId);
    }
    g.dueDates.push(row.dueDate);
    g.maxDiasAtraso = Math.max(g.maxDiasAtraso, row.diasAtraso);
  }
  return order.map((id) => map.get(id)!);
}

/**
 * Markdown pra colar no ChatGPT que trata o extrato bancário: lista cada cliente
 * atrasado com plano, valor esperado e datas em aberto, pedindo pra cruzar com o
 * extrato e apontar quem na verdade pagou.
 */
export function buildOverdueMarkdown(rows: ReadonlyArray<OverdueRow>): string {
  if (rows.length === 0) return "Nenhum pagamento atrasado no momento. 🎉";

  const groups = groupByPlan(rows);
  const lines: string[] = [
    `# Pagamentos atrasados — conferir no extrato (${groups.length})`,
    "",
    "Cruze cada cliente abaixo com o extrato bancário. Para cada um, responda se " +
      "encontrou um pagamento nas datas/valores indicados (informe a data, o valor e o " +
      "banco) ou se não há nenhum lançamento. O objetivo é descobrir se algum desses " +
      "“atrasados” na verdade já pagou e o registro não foi conciliado.",
    "",
  ];
  for (const g of groups) {
    const datas = g.dueDates.map(formatDate).join(", ");
    lines.push(
      `- **${g.clientName}** (${g.planType}) — ${formatBRL(g.rowValue)}/mês — em aberto: ${datas}`
    );
  }
  return lines.join("\n");
}

/** DD/MM a partir de uma data ISO YYYY-MM-DD. */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Texto simples e amigável pra mandar pra sócia no WhatsApp: quem está atrasado,
 * quanto está em aberto e desde quando. Usa *negrito* do WhatsApp.
 */
export function buildOverdueWhatsApp(rows: ReadonlyArray<OverdueRow>): string {
  if (rows.length === 0) return "Nenhum cliente em atraso no momento. ✅";

  const groups = groupByPlan(rows);
  const lines: string[] = [`🔴 Clientes em atraso (${groups.length})`, ""];
  let total = 0;
  for (const g of groups) {
    const count = g.dueDates.length;
    const valorAberto = g.rowValue * count;
    total += valorAberto;
    const oldest = [...g.dueDates].sort()[0];
    const sufixo = count > 1 ? ` (${count} mensalidades)` : "";
    lines.push(
      `• *${g.clientName}* — ${formatBRL(valorAberto)} — desde ${diaMes(oldest)}${sufixo}`
    );
  }
  lines.push("");
  lines.push(`Total em aberto: ${formatBRL(total)}`);
  return lines.join("\n");
}
