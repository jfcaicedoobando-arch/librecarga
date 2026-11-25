/**
 * Encabezado de la tabla de Estado de cuenta con orden por columna.
 * Anchos fijos para que ningún importe se parta en 1366 px.
 */
import { TableHeader, TableRow } from "@/components/ui/table";
import { DetailTableHead } from "@/components/shared/DetailTable";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdenEstadoCuenta, SortEstadoCuenta } from "../services/estadoCuentaAging";

interface Props {
  sort: SortEstadoCuenta;
  onSort: (key: OrdenEstadoCuenta) => void;
}

function SortIcon({ activo, dir }: { activo: boolean; dir: "asc" | "desc" }) {
  if (!activo) return <ChevronsUpDown className="size-3 opacity-40" aria-hidden />;
  return dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />;
}

export function EstadoCuentaTableHead({ sort, onSort }: Props) {
  const ariaSort = (key: OrdenEstadoCuenta): "none" | "ascending" | "descending" => {
    if (sort.key !== key) return "none";
    return sort.dir === "asc" ? "ascending" : "descending";
  };
  const boton = (key: OrdenEstadoCuenta, label: string, alineadoDerecha = false) => (
    <button
      type="button"
      onClick={() => onSort(key)}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        alineadoDerecha && "justify-end w-full",
      )}
    >
      {label}
      <SortIcon activo={sort.key === key} dir={sort.dir} />
    </button>
  );

  return (
    <TableHeader>
      <TableRow>
        <DetailTableHead className="w-8" />
        <DetailTableHead className="w-[92px] whitespace-nowrap" aria-sort={ariaSort("fecha")}>{boton("fecha", "Fecha")}</DetailTableHead>
        <DetailTableHead className="w-[86px]">Folio</DetailTableHead>
        <DetailTableHead className="min-w-[110px]">Concepto</DetailTableHead>
        <DetailTableHead className="w-[100px] whitespace-nowrap" aria-sort={ariaSort("vencimiento")}>{boton("vencimiento", "Vence")}</DetailTableHead>
        <DetailTableHead className="w-[60px] text-right whitespace-nowrap">Días</DetailTableHead>
        <DetailTableHead className="w-[112px] text-right whitespace-nowrap">Cargo</DetailTableHead>
        <DetailTableHead className="w-[112px] text-right whitespace-nowrap">Abono</DetailTableHead>
        <DetailTableHead className="w-[112px] text-right whitespace-nowrap" aria-sort={ariaSort("saldo")}>{boton("saldo", "Saldo", true)}</DetailTableHead>
        <DetailTableHead className="hidden w-[112px] text-right whitespace-nowrap 2xl:table-cell">Acumulado</DetailTableHead>
        <DetailTableHead className="w-[104px]">Estatus</DetailTableHead>
      </TableRow>
    </TableHeader>
  );
}
