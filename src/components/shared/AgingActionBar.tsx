import { Download, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  cubeta: T;
  onChange: (value: T) => void;
  onExport: () => void;
  exportDisabled: boolean;
  exportCount?: number;
}

export function AgingActionBar<T extends string>({
  options, cubeta, onChange, onExport, exportDisabled, exportCount,
}: Props<T>) {
  return (
    <div className="px-6 py-3 border-b bg-accent/5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap">
        {options.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={cubeta === value}
            className={cn(
              "text-body-sm font-medium px-2.5 py-1 rounded-full border transition-colors",
              cubeta === value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted text-muted-foreground border-border",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="min-h-11 min-w-11 md:h-8 md:w-8 md:min-h-0 md:min-w-0" aria-label="Más acciones">
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onExport} disabled={exportDisabled}>
            <Download className="h-3.5 w-3.5 mr-2" aria-hidden /> Exportar CSV{exportCount == null ? "" : ` (${exportCount})`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
