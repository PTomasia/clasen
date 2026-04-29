import { cn } from "@/lib/utils";

type Status = "ativo" | "inativo" | "cancelado";

const STATUS_LABEL: Record<Status, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  cancelado: "Cancelado",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const isActive = status === "ativo";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums",
        isActive
          ? "bg-success/10 text-success"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      {isActive && (
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
