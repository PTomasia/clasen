import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  tone = "muted",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  tone?: "muted" | "success";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-4 py-8 gap-2",
        className
      )}
    >
      {Icon && (
        <Icon
          aria-hidden
          className={cn(
            "size-10 mb-1",
            tone === "success" ? "text-success/40" : "text-muted-foreground/30"
          )}
          strokeWidth={1.25}
        />
      )}
      <p
        className={cn(
          "text-sm",
          tone === "success" ? "text-success font-medium" : "text-foreground"
        )}
      >
        {title}
      </p>
      {description && (
        <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
      )}
    </div>
  );
}
