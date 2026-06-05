import { cn } from "@/lib/utils";
import { CLIENT_TYPE_COLORS, type ClientType } from "@/lib/constants";

export function ClientTypeBadge({
  type,
  className,
}: {
  type: string | null;
  className?: string;
}) {
  if (!type) return <span className="text-muted-foreground">—</span>;

  const color =
    CLIENT_TYPE_COLORS[type as ClientType] ??
    "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        color,
        className
      )}
    >
      {type}
    </span>
  );
}
