import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortDirection } from "@/lib/utils/table-helpers";

// Cabeçalho de tabela clicável para ordenação. Genérico sobre a chave de
// ordenação (string), reutilizado em Planos e Despesas.
export function SortableHead<K extends string>({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  currentSort: K | null;
  currentDirection: SortDirection;
  onSort: (key: K) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  const Icon = isActive
    ? currentDirection === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors -ml-2 px-2 py-1 rounded"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon size={14} className={isActive ? "text-foreground" : "text-muted-foreground/50"} />
      </button>
    </TableHead>
  );
}
