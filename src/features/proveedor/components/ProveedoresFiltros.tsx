import { useState } from "react";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SearchInput from "@/components/shared/SearchInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileFiltersSheet } from "@/components/shared/MobileFiltersSheet";
import type { Enums } from "@/types/db";
import { TIPOS_PROVEEDOR } from "@/constants/proveedorConstants";

type TipoProveedor = Enums<"tipo_proveedor">;
export type OrigenFiltro = "todos" | "Nacional" | "Extranjero";
export type TipoFiltro = "todos" | TipoProveedor;
type FiltrosSnapshot = { search: string; origen: OrigenFiltro; tipoFiltro: TipoFiltro; pagina: number | null };

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  origen: OrigenFiltro;
  onOrigenChange: (v: OrigenFiltro) => void;
  tipoFiltro: TipoFiltro;
  onTipoChange: (v: TipoFiltro) => void;
  onLimpiar: () => void;
  snapshot: () => FiltrosSnapshot;
  restore: (valores: FiltrosSnapshot) => void;
}

export function ProveedoresFiltros(props: Props) {
  const { search, onSearchChange, origen, onOrigenChange, tipoFiltro, onTipoChange, onLimpiar, snapshot, restore } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtrosActivos: { label: string; onClear: () => void }[] = [];
  if (origen !== "todos") filtrosActivos.push({ label: `Origen: ${origen}`, onClear: () => onOrigenChange("todos") });
  if (tipoFiltro !== "todos") filtrosActivos.push({ label: `Tipo: ${tipoFiltro}`, onClear: () => onTipoChange("todos") });
  const activeCount = filtrosActivos.length + Number(Boolean(search.trim()));

  const selectsContent = (
    <>
      <Select value={origen} onValueChange={(v) => onOrigenChange(v as OrigenFiltro)}>
        <SelectTrigger className="h-9 w-full md:w-[160px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Origen: todos</SelectItem>
          <SelectItem value="Nacional">Nacional</SelectItem>
          <SelectItem value="Extranjero">Extranjero</SelectItem>
        </SelectContent>
      </Select>

      <Select value={tipoFiltro} onValueChange={(v) => onTipoChange(v as TipoFiltro)}>
        <SelectTrigger className="h-9 w-full md:w-[200px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Tipo: todos</SelectItem>
          {TIPOS_PROVEEDOR.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchInput value={search} onChange={onSearchChange} placeholder="Buscar por nombre, RFC, contacto o email…" />
          </div>
          <div className="md:hidden">
            <MobileFiltersSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              activeCount={activeCount}
              onClearAll={onLimpiar}
              title="Filtros de proveedores"
              snapshot={snapshot}
              restore={(foto) => restore(foto as FiltrosSnapshot)}
            >
              {selectsContent}
            </MobileFiltersSheet>
          </div>
        </div>

        <div className="hidden md:flex flex-wrap items-center gap-2">
          {selectsContent}
        </div>

        {filtrosActivos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filtrosActivos.map((f) => (
              <Badge key={f.label} variant="outline" className="gap-1">
                {f.label}
                <button
                  type="button"
                  onClick={f.onClear}
                  className="rounded-sm hover:bg-muted/60 transition-colors"
                  aria-label={`Quitar filtro ${f.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9" onClick={onLimpiar}>
            Limpiar búsqueda y filtros
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
