// Helpers para gerar Markdown estruturado consumível por LLMs (CFO no ChatGPT).
// Para formatação BRL/percentual/data, reusamos lib/utils/formatting.ts.

export function mdHeader(level: 1 | 2 | 3, text: string): string {
  return `${"#".repeat(level)} ${text}`;
}

export function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  const sep = header.map(() => "---");
  const escape = (cell: string) => String(cell ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines = [
    `| ${header.map(escape).join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ];
  return lines.join("\n");
}

export function mdBullet(text: string): string {
  return `- ${text}`;
}

export function mdBold(text: string): string {
  return `**${text}**`;
}

// "2026-05-04" -> "04/05/2026 14:32"
export function formatDateTimeBR(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}
