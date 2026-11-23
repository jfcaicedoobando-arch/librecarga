/**
 * `<UnifiedFiltersBar />` — barra de filtros estándar consumida por listados.
 *
 * Componen: search + slots `primary` (selects visibles) + botón Sheet
 * (`secondary`) + chips activos con botón "Limpiar todo".
 */
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import SearchInput from "@/components/shared/SearchInput";
import { MobileFiltersSheet } from "@/components/shared/MobileFiltersSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/shared";
import { cn } from "@/lib/utils";
import type { ChipItem } from "@/hooks/shared";

const QUITAR_FILTRO_CLASS = "ml-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface UnifiedFiltersBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Filtros que se muestran siempre (ej. select de estado). */
  primary?: ReactNode;
  /** Primarios temporales cuando se trasladan al panel móvil. */
  sheetPrimary?: ReactNode;
  /** Filtros que se muestran dentro del Sheet lateral. */
  secondary?: ReactNode;
  chips: ChipItem[];
  activeCount: number;
  onClearAll: () => void;
  /** Ciclo de vida y acciones de un borrador administrado por el consumidor. */
  onSheetOpenChange?: (open: boolean) => void;
  onApply?: () => void;
  onSheetClearAll?: () => void;
  sheetActiveCount?: number;
  /**
   * v13.823.341 — la selección dentro del panel es temporal: al abrirlo se
   * toma una foto y al cerrarlo sin "Aplicar" se restaura.
   */
  snapshot?: () => unknown;
  restore?: (foto: unknown) => void;
  className?: string;
}

export function UnifiedFiltersBar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  primary,
  sheetPrimary,
  secondary,
  chips,
  activeCount,
  onClearAll,
  onSheetOpenChange,
  onApply,
  onSheetClearAll,
  sheetActiveCount,
  snapshot,
  restore,
  className,
}: UnifiedFiltersBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useIsMobile();
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const quitarChip = (event: MouseEvent<HTMLButtonElement>, quitar: () => void) => {
    const botones = Array.from(chipsRef.current?.querySelectorAll<HTMLButtonElement>("[data-quitar-filtro]") ?? []);
    const siguiente = botones[botones.indexOf(event.currentTarget) + 1];
    (siguiente ?? searchRef.current)?.focus();
    quitar();
  };

  const hasChips = chips.length > 0 || Boolean(search);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* VB-29: max-w-sm (384px) para que placeholders largos tipo
            "Buscar por expediente, cliente o mercancía…" no se trunquen.
            v13.823.25 (fold 692px): en móvil el buscador ocupa el renglón
            completo y los selects `primary` se mueven al panel de filtros. */}
        <div className="w-full min-w-0 flex-1 md:w-auto md:max-w-sm">
          <SearchInput
            ref={searchRef}
            value={search}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
          />
        </div>
        {primary && !isMobile ? (
          <div className="flex flex-wrap items-center gap-2">{primary}</div>
        ) : null}
        {/* El panel sólo existe si tendrá contenido: en escritorio requiere
            `secondary`; en móvil basta con `primary`, que vive dentro. */}
        {secondary || (isMobile && primary) ? (
          <MobileFiltersSheet
            open={sheetOpen}
            onOpenChange={(open) => {
              onSheetOpenChange?.(open);
              setSheetOpen(open);
            }}
            activeCount={activeCount}
            selectionCount={sheetActiveCount}
            onClearAll={onSheetClearAll ?? onClearAll}
            onApply={onApply}
            snapshot={snapshot}
            restore={restore}
          >
            {isMobile && primary ? (
              <div className="space-y-3">{sheetPrimary ?? primary}</div>
            ) : null}
            {secondary}
          </MobileFiltersSheet>
        ) : null}
      </div>

      {hasChips ? (
        <div ref={chipsRef} className="flex flex-wrap items-center gap-1.5">
          {search ? (
            <Badge variant="secondary" className="gap-1">
              <span>Búsqueda: {search}</span>
              <button
                type="button"
                aria-label="Quitar búsqueda"
                data-quitar-filtro
                onClick={(event) => quitarChip(event, () => onSearchChange(""))}
                className={QUITAR_FILTRO_CLASS}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ) : null}
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1">
              <span>{chip.label}</span>
              <button
                type="button"
                aria-label={`Quitar ${chip.label}`}
                data-quitar-filtro
                onClick={(event) => quitarChip(event, chip.onRemove)}
                className={QUITAR_FILTRO_CLASS}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ))}
          {chips.length + (search ? 1 : 0) > 1 ? (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-body-sm" onClick={onClearAll}>
              Limpiar todo
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
