import { useRef } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterChip {
  key: string;
  label: string;
  value?: string;
  onRemove: () => void;
}

interface Props {
  chips: FilterChip[];
  onClearAll: () => void;
  searchId?: string;
  className?: string;
  title?: string;
  clearLabel?: string;
}

export function ActiveFilterChips({ chips, onClearAll, searchId, className, title = "Activos:", clearLabel = "Limpiar todo" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focusSearch = () => {
    if (searchId) document.getElementById(searchId)?.focus();
  };

  const remove = (chip: FilterChip, index: number) => {
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("[data-filter-remove]");
    const next = buttons?.[index + 1] ?? buttons?.[index - 1];
    chip.onRemove();
    requestAnimationFrame(() => {
      if (next?.isConnected) next.focus();
      else focusSearch();
    });
  };

  if (chips.length === 0) return null;
  return (
    <div ref={ref} className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-body-sm text-muted-foreground">{title}</span>
      {chips.map((chip, index) => (
        <Badge key={chip.key} variant="secondary" className="max-w-full gap-1 py-0 pl-2 pr-0 text-body-sm font-normal">
          <span className="min-w-0 truncate">
            {chip.value === undefined ? chip.label : <><span className="text-muted-foreground">{chip.label}: </span>{chip.value}</>}
          </span>
          <Button type="button" variant="ghost" size="icon" data-filter-remove
            className="shrink-0 md:h-8 md:w-8"
            aria-label={`Quitar filtro ${chip.label}`} onClick={() => remove(chip, index)}>
            <X className="h-3 w-3" aria-hidden />
          </Button>
        </Badge>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => {
        onClearAll();
        requestAnimationFrame(focusSearch);
      }}>
        {clearLabel}
      </Button>
    </div>
  );
}
