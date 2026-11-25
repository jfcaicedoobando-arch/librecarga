/**
 * Barra de filtros del libro maestro de pagos: periodo con atajos, cuenta,
 * moneda, método de pago, conciliación, complemento y búsqueda.
 */
import { useId } from "react";
import { SlidersHorizontal } from "lucide-react";
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FILTROS_LIBRO_PAGOS_INICIALES,
  type FiltroConciliacion, type FiltroRep, type FiltrosLibroPagos,
} from "@/features/tesoreria/domain/libroPagos";
import {
  rangoAnioPagos, rangoMesPagos, rangoTrimestrePagos, type RangoPagos,
} from "@/features/tesoreria/domain/libroPagosRangos";

interface CuentaOption {
  id: string;
  alias: string;
  moneda: string;
}

type ConsultaCuentas = { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };

interface Props {
  cuentas: CuentaOption[];
  consultaCuentas?: ConsultaCuentas;
  monedas: string[];
  metodos: string[];
  filtros: FiltrosLibroPagos;
  onFiltrosChange: (patch: Partial<FiltrosLibroPagos>) => void;
  rango: RangoPagos;
  onRangoChange: (rango: RangoPagos) => void;
}

const FILTROS_SECUNDARIOS = ["cuentaId", "moneda", "metodo", "conciliacion", "rep"] as const;

export function LibroPagosToolbar({
  cuentas, consultaCuentas, monedas, metodos, filtros, onFiltrosChange, rango, onRangoChange,
}: Props) {
  const idRango = useId();
  const activos = FILTROS_SECUNDARIOS.filter((filtro) =>
    filtros[filtro] !== FILTROS_LIBRO_PAGOS_INICIALES[filtro],
  ).length;
  const filtrosSecundarios = (
    <>
      <FiltroCuenta cuentas={cuentas} value={filtros.cuentaId} consulta={consultaCuentas}
        onChange={(cuentaId) => onFiltrosChange({ cuentaId })} />
      <FiltroSelect label="Moneda" value={filtros.moneda} options={["todas", ...monedas]} onChange={(moneda) => onFiltrosChange({ moneda })} />
      <FiltroSelect label="Medio de pago" value={filtros.metodo} options={["todos", ...metodos]} onChange={(metodo) => onFiltrosChange({ metodo })} />
      <FiltroSelect label="Conciliación" value={filtros.conciliacion} options={["todos", "conciliados", "pendientes"]} onChange={(conciliacion) => onFiltrosChange({ conciliacion: conciliacion as FiltroConciliacion })} />
      <FiltroSelect label="Complemento" value={filtros.rep} options={["todos", "timbrado", "pendiente", "cancelado"]} onChange={(rep) => onFiltrosChange({ rep: rep as FiltroRep })} />
    </>
  );
  return (
    <Card>
      <CardContent density="compact" className="grid grid-cols-2 items-end gap-3 short:gap-2 md:grid-cols-12">
        <div className="md:col-span-2">
          <label htmlFor={`${idRango}-desde`} className="mb-1 block text-body-sm text-muted-foreground">Desde</label>
          <DatePickerMx
            id={`${idRango}-desde`}
            value={rango.desde}
            onChange={(iso) => onRangoChange({ ...rango, desde: iso })}
            max={rango.hasta}
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={`${idRango}-hasta`} className="mb-1 block text-body-sm text-muted-foreground">Hasta</label>
          <DatePickerMx
            id={`${idRango}-hasta`}
            value={rango.hasta}
            onChange={(iso) => onRangoChange({ ...rango, hasta: iso })}
            min={rango.desde}
          />
        </div>

        <div className="flex items-center gap-1 md:col-span-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onRangoChange(rangoMesPagos())}>
            Mes
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onRangoChange(rangoTrimestrePagos())}>
            Trimestre
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onRangoChange(rangoAnioPagos())}>
            Año
          </Button>
        </div>

        <details className="col-span-2 md:hidden">
          <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-body-sm font-medium">
            <SlidersHorizontal className="size-4" aria-hidden />
            <span>Más filtros</span>
            {activos > 0 && (
              <>
                <span className={badgeVariants({ variant: "secondary", size: "sm" })} aria-hidden>{activos}</span>
                <span className="sr-only">, {activos} {activos === 1 ? "filtro activo" : "filtros activos"}</span>
              </>
            )}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">{filtrosSecundarios}</div>
        </details>
        <div className="hidden md:contents">{filtrosSecundarios}</div>

        <div className="col-span-2 md:col-span-5 md:row-start-1 md:col-start-8">
          <p className="text-body-sm text-muted-foreground mb-1">Buscar</p>
          <SearchInput
            value={filtros.texto}
            onChange={(texto) => onFiltrosChange({ texto })}
            placeholder="Cliente, proveedor, folio o referencia"
            aria-label="Buscar pagos por contraparte, folio o referencia"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FiltroSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-body-sm text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o === "todos" || o === "todas" ? "Todos" : o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function FiltroCuenta({ cuentas, consulta, value, onChange }: {
  cuentas: CuentaOption[]; consulta?: ConsultaCuentas; value: string; onChange: (value: string) => void;
}) {
  return (
    <div className="col-span-2 md:col-span-3">
      <p className="mb-1 text-body-sm text-muted-foreground">Cuenta bancaria</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="Cuenta bancaria"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas las cuentas</SelectItem>
          {cuentas.map((c) => <SelectItem key={c.id} value={c.id}>{c.alias} · {c.moneda}</SelectItem>)}
        </SelectContent>
      </Select>
      {consulta?.isLoading && <p role="status" className="mt-1 text-body-sm text-muted-foreground">Consultando cuentas…</p>}
      {consulta?.isError && (
        <div className="mt-1 text-body-sm">
          <p role="alert" className="text-destructive">No se pudieron consultar las cuentas bancarias.</p>
          <Button type="button" size="sm" variant="link" className="px-0"
            onClick={() => void consulta.refetch()} loading={consulta.isFetching}>
            Reintentar cuentas
          </Button>
        </div>
      )}
    </div>
  );
}
