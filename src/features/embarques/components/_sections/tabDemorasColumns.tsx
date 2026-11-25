/**
 * Columnas para `TabDemoras` — extraídas en v13.182.0 (Wave 2 splits).
 */
import { formatDate } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/shared/Hint";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { Button } from "@/components/ui/button";
import { defineColumns, type ColumnDef } from "@/components/shared/DataTable";
import { Save } from "lucide-react";
import type { EmbarqueContenedor } from "@/features/embarques/types/contenedor";
import { resolveTipoContenedorNombre, type TipoContenedorCatalogo } from "@/lib/domain/tipoContenedor";

export interface DraftPatch {
  fecha_descarga?: string | null;
  fecha_devolucion?: string | null;
  dias_libres_override?: number | null;
}

export interface EditableRow extends EmbarqueContenedor {
  // SAFE-CAST: columnas nuevas (13.66.11) aún no regeneradas en supabase/types.ts.
  fecha_descarga: string | null;
  fecha_devolucion: string | null;
  dias_libres_override: number | null;
}

export interface DemorasColumnsDeps {
  canEdit: boolean;
  drafts: Record<string, DraftPatch>;
  isPending: boolean;
  valorActual: <K extends keyof DraftPatch>(row: EditableRow, field: K) => DraftPatch[K];
  setDraft: (id: string, patch: DraftPatch) => void;
  guardar: (id: string) => void;
  /** VIS-CE-251-05: catálogo para resolver UUIDs de tipo de contenedor. */
  tiposContenedor: TipoContenedorCatalogo[];
}

function etiquetaContenedor(row: EditableRow): string {
  return row.numero_contenedor || `#${row.orden}`;
}

export function buildDemorasColumns(deps: DemorasColumnsDeps): ColumnDef<EditableRow, unknown>[] {
  const { canEdit, drafts, isPending, valorActual, setDraft, guardar, tiposContenedor } = deps;
  return defineColumns<EditableRow>([
    {
      id: "cont",
      header: "Contenedor",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-body">
            {etiquetaContenedor(row.original)}
          </span>
          {/* VIS-CE-251-05: el valor puede ser un UUID del catálogo; se resuelve igual que en Resumen. */}
          <span className="text-body-sm text-muted-foreground">{resolveTipoContenedorNombre(row.original.tipo_contenedor, tiposContenedor)}</span>
        </div>
      ),
    },
    {
      id: "f_desc",
      header: "Fecha de descarga",
      cell: ({ row }) => canEdit ? (
        <DatePickerMx
          value={(valorActual(row.original, "fecha_descarga") as string | null) ?? ""}
          onChange={(v) => setDraft(row.original.id, { fecha_descarga: v || null })}
          aria-label={`Fecha de descarga, contenedor ${etiquetaContenedor(row.original)}`}
          calendarLabel={`Abrir calendario de descarga, contenedor ${etiquetaContenedor(row.original)}`}
          className="w-48 md:h-8 md:w-40"
        />
      ) : formatDate(row.original.fecha_descarga ?? ""),
    },
    {
      id: "f_dev",
      header: "Fecha de devolución",
      cell: ({ row }) => canEdit ? (
        <DatePickerMx
          value={(valorActual(row.original, "fecha_devolucion") as string | null) ?? ""}
          onChange={(v) => setDraft(row.original.id, { fecha_devolucion: v || null })}
          aria-label={`Fecha de devolución, contenedor ${etiquetaContenedor(row.original)}`}
          calendarLabel={`Abrir calendario de devolución, contenedor ${etiquetaContenedor(row.original)}`}
          className="w-48 md:h-8 md:w-40"
        />
      ) : formatDate(row.original.fecha_devolucion ?? ""),
    },
    {
      id: "dias_libres",
      header: "Días libres (override)",
      meta: { align: "right" },
      cell: ({ row }) => (
        <Hint label="Vacío = usa los días libres configurados en la naviera. Capturá un número para sobreescribir.">
          <Input
            aria-label={`Días libres, contenedor ${etiquetaContenedor(row.original)}`}
            type="number"
            min={0}
            disabled={!canEdit}
            placeholder="usa naviera"
            className="h-8 w-[120px] tabular-nums text-right placeholder:italic placeholder:text-muted-foreground/60"
            value={(valorActual(row.original, "dias_libres_override") as number | null) ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(row.original.id, {
                dias_libres_override: raw === "" ? null : Number(raw),
              });
            }}
          />
        </Hint>
      ),
    },
    {
      id: "save",
      header: "",
      cell: ({ row }) => {
        const hasDraft = !!drafts[row.original.id];
        return (
          <Button
            size="sm"
            variant={hasDraft ? "default" : "ghost"}
            disabled={!hasDraft || isPending || !canEdit}
            onClick={() => guardar(row.original.id)}
            aria-label={`Guardar demoras, contenedor ${etiquetaContenedor(row.original)}`}
          >
            <Save className="size-3.5 mr-1" />
            Guardar
          </Button>
        );
      },
    },
  ]);
}
